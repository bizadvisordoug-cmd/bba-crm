-- ============================================================
-- Migration 027: Referral Program Management
-- Tracks referral partners and payment agreements
-- ============================================================

CREATE TABLE public.referral_partners (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  contact_name text,
  contact_email text,
  contact_phone text,
  payment_day int NOT NULL CHECK (payment_day >= 1 AND payment_day <= 31),
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.referral_agreements (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES public.referral_partners(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  payment_type text NOT NULL CHECK (payment_type IN ('one_time', 'residual')),
  amount numeric(10, 2) NOT NULL,
  who_pays text NOT NULL CHECK (who_pays IN ('us', 'pos_company')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  start_date date DEFAULT CURRENT_DATE,
  end_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(partner_id, lead_id, payment_type)
);

CREATE TABLE public.referral_payments (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  agreement_id uuid NOT NULL REFERENCES public.referral_agreements(id) ON DELETE CASCADE,
  date_paid date NOT NULL,
  amount numeric(10, 2) NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read referral_partners" ON public.referral_partners
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can manage referral_partners" ON public.referral_partners
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

CREATE POLICY "Users can read referral_agreements" ON public.referral_agreements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can manage referral_agreements" ON public.referral_agreements
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

CREATE POLICY "Users can read referral_payments" ON public.referral_payments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can manage referral_payments" ON public.referral_payments
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'vp_operations')
    )
  );

CREATE INDEX referral_agreements_partner_idx ON public.referral_agreements(partner_id);
CREATE INDEX referral_agreements_lead_idx ON public.referral_agreements(lead_id);
CREATE INDEX referral_agreements_status_idx ON public.referral_agreements(status);
CREATE INDEX referral_payments_agreement_idx ON public.referral_payments(agreement_id);
CREATE INDEX referral_payments_date_idx ON public.referral_payments(date_paid);
