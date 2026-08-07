-- Migration 033: campaign step scheduling
--
-- campaign_steps.delay_days has always been captured in the UI, but nothing
-- ever scheduled the follow-up steps: the first message was sent at enrollment
-- and the enrollment then sat at current_step = 2 forever. These columns give
-- the scheduler cron something to query on.
--
-- delay_days is CUMULATIVE days from enrollment (0, 1, 4, 7, 14, 21 ...),
-- so a step is due at enrolled_at + delay_days.

ALTER TABLE public.campaign_enrollments
  ADD COLUMN IF NOT EXISTS next_send_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;

-- The cron scans for active enrollments that are due
CREATE INDEX IF NOT EXISTS campaign_enrollments_due_idx
  ON public.campaign_enrollments (status, next_send_at);

-- Backfill: existing active enrollments are stuck mid-campaign with no
-- schedule. Give each one the due date its current step should have had.
-- Anything already past due lands in the past and gets picked up on the next
-- cron run (one step per run, so nobody receives a burst of back-dated mail).
UPDATE public.campaign_enrollments e
SET    next_send_at = e.enrolled_at + (s.delay_days || ' days')::interval
FROM   public.campaign_steps s
WHERE  s.campaign_id  = e.campaign_id
  AND  s.step_number  = e.current_step
  AND  e.status       = 'active'
  AND  e.next_send_at IS NULL;

-- Active enrollments whose current_step no longer exists (campaign was edited
-- or they ran past the last step) have nothing left to send.
UPDATE public.campaign_enrollments e
SET    status = 'completed'
WHERE  e.status = 'active'
  AND  e.next_send_at IS NULL
  AND  NOT EXISTS (
         SELECT 1 FROM public.campaign_steps s
         WHERE s.campaign_id = e.campaign_id
           AND s.step_number = e.current_step
       );

NOTIFY pgrst, 'reload schema';
