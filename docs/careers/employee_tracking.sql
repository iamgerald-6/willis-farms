-- Links WillsOne user accounts to recruitment onboarding records and tracks probation.
-- Run in Supabase SQL Editor after docs/careers/onboarding.sql

alter table public.users
  add column if not exists application_id uuid references public.job_applications(id) on delete set null;

alter table public.users
  add column if not exists employment_status text;

alter table public.users
  drop constraint if exists users_employment_status_check;

alter table public.users
  add constraint users_employment_status_check
  check (employment_status is null or employment_status in (
    'probation',
    'active',
    'fired',
    'quit',
    'deceased'
  ));

alter table public.users
  add column if not exists platform_invited_at timestamptz;

create index if not exists users_application_id_idx
  on public.users (application_id)
  where application_id is not null;

comment on column public.users.application_id is
  'Set when HR invites a candidate from Recruitment → onboarding (User Management invite).';

comment on column public.users.employment_status is
  'probation → active (permanent) on HR confirm; fired | quit | deceased on exit (account disabled).';

comment on column public.users.platform_invited_at is
  'When the WillsOne platform invite email was sent.';

notify pgrst, 'reload schema';
