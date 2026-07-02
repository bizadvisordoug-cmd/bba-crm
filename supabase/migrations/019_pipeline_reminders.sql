-- Pipeline reminder settings
create table public.pipeline_reminder_settings (
  id uuid default uuid_generate_v4() primary key,
  pipeline_stage text not null unique,
  reminder_days integer,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Insert default settings
insert into public.pipeline_reminder_settings (pipeline_stage, reminder_days, enabled) values
('New Lead', 3, true),
('Contacted', 5, true),
('Appointment Set', 7, true),
('Contract Sent', 2, true),
('Signed', null, false),
('Equipment Ordered', null, false),
('Install Scheduled', null, false),
('Active Client', null, false);

-- Enable RLS
alter table public.pipeline_reminder_settings enable row level security;

-- Allow admins to view and update reminder settings
create policy "Admins can view reminder settings" on public.pipeline_reminder_settings
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.role in ('owner', 'vp_operations')
    )
  );

create policy "Admins can update reminder settings" on public.pipeline_reminder_settings
  for update to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
      and u.role in ('owner', 'vp_operations')
    )
  );
