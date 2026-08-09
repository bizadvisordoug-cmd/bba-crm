-- ============================================================
-- Migration 034: Referral payout tracking
--
-- referral_partners and referral_payment_records were created in 028 but
-- nothing ever read or wrote them. This wires them up:
--
--  1. leads.referred_by is free text, so "Jane Smith" and "jane smith" on two
--     leads are different partners to any code that groups by that string
--     (the residual reminder cron does exactly that). Adds a real FK and
--     backfills partners from the text already entered.
--  2. referral_payment_records had no period, so there was no way to tell
--     whether THIS month's residual had been paid. Adds period_year/month.
-- ============================================================

-- ── 0. Reconcile referral_partners with production ────────────────────────
-- Production has a payment_day column on referral_partners that no migration
-- in this repo creates — it was added straight to the database. It is NOT NULL
-- with no default, so any insert that omits it fails. Ensure the column exists
-- for environments built from migrations, and give it a default so inserts
-- that do not name it (the backfill below, and POST /api/referrals/partners)
-- succeed. 15 matches the default used for pos_systems.payment_day in 029.

ALTER TABLE public.referral_partners
  ADD COLUMN IF NOT EXISTS payment_day int;

ALTER TABLE public.referral_partners
  ALTER COLUMN payment_day SET DEFAULT 15;

UPDATE public.referral_partners SET payment_day = 15 WHERE payment_day IS NULL;

-- ── 1. Link leads to partners ─────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS referral_partner_id uuid
    REFERENCES public.referral_partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_referral_partner_idx
  ON public.leads(referral_partner_id);

-- Create a partner row for every distinct name already typed into leads.
-- Matched case-insensitively on trimmed text so casing variants collapse into
-- one partner instead of splitting the payout.
INSERT INTO public.referral_partners (name)
SELECT DISTINCT ON (lower(trim(l.referred_by))) trim(l.referred_by)
FROM   public.leads l
WHERE  l.referred_by IS NOT NULL
  AND  trim(l.referred_by) <> ''
  AND  NOT EXISTS (
         SELECT 1 FROM public.referral_partners p
         WHERE lower(p.name) = lower(trim(l.referred_by))
       )
ORDER  BY lower(trim(l.referred_by)), trim(l.referred_by);

UPDATE public.leads l
SET    referral_partner_id = p.id
FROM   public.referral_partners p
WHERE  l.referral_partner_id IS NULL
  AND  l.referred_by IS NOT NULL
  AND  lower(trim(l.referred_by)) = lower(p.name);

-- ── 2. Period tracking on payment records ─────────────────────────────────

ALTER TABLE public.referral_payment_records
  ADD COLUMN IF NOT EXISTS partner_id uuid
    REFERENCES public.referral_partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_type text
    CHECK (payment_type IS NULL OR payment_type IN ('one_time', 'residual')),
  ADD COLUMN IF NOT EXISTS period_year int,
  ADD COLUMN IF NOT EXISTS period_month int
    CHECK (period_month IS NULL OR period_month BETWEEN 1 AND 12);

CREATE INDEX IF NOT EXISTS referral_payment_records_partner_idx
  ON public.referral_payment_records(partner_id);

CREATE INDEX IF NOT EXISTS referral_payment_records_period_idx
  ON public.referral_payment_records(period_year, period_month);

-- A residual can only be paid once per lead per month. One-time bonuses leave
-- the period columns null and are excluded from the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS referral_payment_records_residual_unique_idx
  ON public.referral_payment_records (lead_id, period_year, period_month)
  WHERE period_year IS NOT NULL AND period_month IS NOT NULL;

-- Backfill partner_id on any existing payment rows
UPDATE public.referral_payment_records r
SET    partner_id = p.id
FROM   public.referral_partners p
WHERE  r.partner_id IS NULL
  AND  lower(trim(r.referred_by)) = lower(p.name);

NOTIFY pgrst, 'reload schema';
