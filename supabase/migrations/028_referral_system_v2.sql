-- ============================================================
-- Migration 028: Referral System V2 - Commission-based
-- Simplified referral tracking with percentage-based residuals
-- ============================================================

-- Add referral fields to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS referred_by text,
ADD COLUMN IF NOT EXISTS referral_type text CHECK (referral_type IS NULL OR referral_type IN ('one_time', 'residual')),
ADD COLUMN IF NOT EXISTS referral_amount numeric(10, 2),
ADD COLUMN IF NOT EXISTS referral_percentage numeric(5, 2),
ADD COLUMN IF NOT EXISTS referral_paid boolean DEFAULT false;

-- Referral partners table
CREATE TABLE IF NOT EXISTS public.referral_partners (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Referral payment tracking
CREATE TABLE IF NOT EXISTS public.referral_payment_records (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  referred_by text NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  amount numeric(10, 2) NOT NULL,
  percentage numeric(5, 2),
  date_paid date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_payment_records ENABLE ROW LEVEL SECURITY;

-- Policies for referral_partners
CREATE POLICY IF NOT EXISTS "Users can read referral_partners" ON public.referral_partners
  FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "Only admins can manage referral_partners" ON public.referral_partners
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

-- Policies for referral_payment_records
CREATE POLICY IF NOT EXISTS "Users can read referral_payment_records" ON public.referral_payment_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "Only admins can manage referral_payment_records" ON public.referral_payment_records
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS referral_payment_records_referred_by_idx ON public.referral_payment_records(referred_by);
CREATE INDEX IF NOT EXISTS referral_payment_records_lead_idx ON public.referral_payment_records(lead_id);
CREATE INDEX IF NOT EXISTS referral_payment_records_date_idx ON public.referral_payment_records(date_paid);
CREATE INDEX IF NOT EXISTS leads_referred_by_idx ON public.leads(referred_by);
CREATE INDEX IF NOT EXISTS leads_referral_type_idx ON public.leads(referral_type);
