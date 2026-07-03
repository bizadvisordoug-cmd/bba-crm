-- Add user_id to pipeline_reminder_settings and make it per-user
alter table public.pipeline_reminder_settings add column user_id uuid references public.users(id) on delete cascade;

-- Remove old unique constraint on pipeline_stage
alter table public.pipeline_reminder_settings drop constraint pipeline_reminder_settings_pipeline_stage_key;

-- Add new unique constraint for (user_id, pipeline_stage)
alter table public.pipeline_reminder_settings add unique (user_id, pipeline_stage);

-- Update RLS policies to be per-user
drop policy "Admins can view reminder settings" on public.pipeline_reminder_settings;
drop policy "Admins can update reminder settings" on public.pipeline_reminder_settings;

-- Users can view their own settings
create policy "Users can view their own reminder settings" on public.pipeline_reminder_settings
  for select using (user_id = auth.uid());

-- Users can update their own settings
create policy "Users can update their own reminder settings" on public.pipeline_reminder_settings
  for update using (user_id = auth.uid());

-- Users can insert their own settings
create policy "Users can insert their own reminder settings" on public.pipeline_reminder_settings
  for insert with check (user_id = auth.uid());

-- Admins can view all settings (for debugging/support)
create policy "Admins can view all reminder settings" on public.pipeline_reminder_settings
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.role in ('owner', 'vp_operations')
    )
  );
