-- ============================================================
-- Migration 035: mark a referral period as "no payment due"
--
-- A residual can legitimately produce nothing in a given month — the merchant
-- stopped processing, the residual was below a threshold, the account closed.
-- Without a way to record that, the lead sits under "Awaiting processor
-- payment" forever and it is impossible to tell "nothing was owed" apart from
-- "we forgot to enter it".
--
-- Recorded as a referral_payment_records row so it reuses the existing
-- per-period unique index and clears the lead from the awaiting list.
-- ============================================================

ALTER TABLE public.referral_payment_records
  ADD COLUMN IF NOT EXISTS no_payment_due boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.referral_payment_records.no_payment_due IS
  'True when the period was closed out with nothing owed. Amount will be 0.';

NOTIFY pgrst, 'reload schema';
