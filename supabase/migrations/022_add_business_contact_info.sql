-- ============================================================
-- Migration 022: Add Business Contact Information
-- Adds business_phone and business_email to businesses table
-- to capture complete contact details per business location
-- ============================================================

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS business_phone text,
  ADD COLUMN IF NOT EXISTS business_email text;

CREATE INDEX IF NOT EXISTS businesses_phone_idx ON public.businesses(business_phone);
CREATE INDEX IF NOT EXISTS businesses_email_idx ON public.businesses(business_email);
