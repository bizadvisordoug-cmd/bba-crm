-- Add customizable footer text to campaign steps
alter table public.campaign_steps
add column footer_text text;

-- Set default footer for existing steps
update public.campaign_steps
set footer_text = 'You''re receiving this email from Breakthrough Business Advisors'
where footer_text is null;
