-- =============================================================================
-- Wills Farms — Referee reference forms (sent when candidate submits application)
-- Run in Supabase SQL Editor after job_applications exists.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- referee_reference_tokens — magic links per referee (1 or 2) per application
-- ---------------------------------------------------------------------------
create table if not exists public.referee_reference_tokens (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.job_applications(id) on delete cascade,
  referee_index   smallint not null check (referee_index in (1, 2)),
  referee_name    text not null,
  referee_email   text not null,
  token           text not null unique,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  last_sent_at    timestamptz,
  revoked_at      timestamptz
);

create index if not exists referee_reference_tokens_application_idx
  on public.referee_reference_tokens (application_id);

create index if not exists referee_reference_tokens_active_idx
  on public.referee_reference_tokens (token)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- referee_reference_submissions — one row per referee slot per application
-- ---------------------------------------------------------------------------
create table if not exists public.referee_reference_submissions (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.job_applications(id) on delete cascade,
  token_id        uuid references public.referee_reference_tokens(id) on delete set null,
  referee_index   smallint not null check (referee_index in (1, 2)),
  form_data       jsonb not null default '{}'::jsonb,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (application_id, referee_index)
);

create index if not exists referee_reference_submissions_app_idx
  on public.referee_reference_submissions (application_id);

drop trigger if exists referee_reference_submissions_updated_at on public.referee_reference_submissions;
create trigger referee_reference_submissions_updated_at
  before update on public.referee_reference_submissions
  for each row execute function public.set_updated_at();

comment on table public.referee_reference_submissions is
  'Confidential referee reference responses; linked to job application.';
