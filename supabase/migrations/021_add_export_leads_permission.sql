-- Add can_export_leads column to users table
alter table public.users add column can_export_leads boolean default false;

-- Allow users to view their own permission
create policy "Users can view their own export permission" on public.users
  for select using (auth.uid() = id);

-- Allow admins to view and update export permission
create policy "Admins can update export permission" on public.users
  for update using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.role in ('owner', 'vp_operations')
    )
  );
