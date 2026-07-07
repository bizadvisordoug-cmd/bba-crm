-- ============================================================
-- Migration 025: Follow-Up Date Reminders
-- Tracks sent follow-up reminders to avoid duplicates
-- ============================================================

CREATE TABLE public.follow_up_reminders_sent (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  reminder_type text NOT NULL CHECK (reminder_type IN ('due_today', 'overdue')),
  sent_at timestamptz DEFAULT now(),
  next_follow_up_date date NOT NULL,
  UNIQUE(lead_id, user_id, reminder_type, next_follow_up_date)
);

ALTER TABLE public.follow_up_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own reminder history" ON public.follow_up_reminders_sent
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all reminder history" ON public.follow_up_reminders_sent
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

CREATE INDEX follow_up_reminders_sent_lead_idx ON public.follow_up_reminders_sent(lead_id);
CREATE INDEX follow_up_reminders_sent_user_idx ON public.follow_up_reminders_sent(user_id);
CREATE INDEX follow_up_reminders_sent_date_idx ON public.follow_up_reminders_sent(next_follow_up_date);
