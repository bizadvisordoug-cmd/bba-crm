-- Add 'Trade Show' as a valid lead source
ALTER TABLE public.leads
DROP CONSTRAINT leads_lead_source_check,
ADD CONSTRAINT leads_lead_source_check CHECK (lead_source = ANY (ARRAY['Referral'::text, 'Cold Call'::text, 'Cold Email'::text, 'Trade Show'::text, 'Other'::text]));
