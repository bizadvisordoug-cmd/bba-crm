-- Restrict Shanon from seeing Stackably leads
-- This policy prevents Shanon Boos from viewing any leads with Stackably as the POS system
create policy "Shanon cannot see Stackably leads" on public.leads
  for select using (
    -- Allow if user is Shanon and lead is NOT Stackably
    case
      when auth.uid() = 'e128723f-8315-43f1-a67b-c5b9fd309ce1'::uuid then pos_system != 'Stackably'
      else true
    end
  );
