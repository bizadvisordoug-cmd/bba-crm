-- Campaign enrollments RLS policies
-- Allow users to enroll leads in campaigns (insert new enrollments)
create policy "Users can enroll leads in campaigns" on public.campaign_enrollments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
      and (
        l.assigned_rep_id = auth.uid()
        or exists (
          select 1 from public.users u
          where u.id = auth.uid()
          and u.role in ('owner', 'vp_operations')
        )
      )
    )
  );

-- Allow users to view enrollments for leads they have access to
create policy "Users can view their enrollments" on public.campaign_enrollments
  for select using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
      and (
        l.assigned_rep_id = auth.uid()
        or exists (
          select 1 from public.users u
          where u.id = auth.uid()
          and u.role in ('owner', 'vp_operations')
        )
      )
    )
  );

-- Allow users to update enrollments for leads they have access to
create policy "Users can update their enrollments" on public.campaign_enrollments
  for update using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
      and (
        l.assigned_rep_id = auth.uid()
        or exists (
          select 1 from public.users u
          where u.id = auth.uid()
          and u.role in ('owner', 'vp_operations')
        )
      )
    )
  );
