-- =============================================================================
-- Wills Farms — Recruitment onboarding tables
-- =============================================================================
-- Run in Supabase SQL Editor AFTER the base schema in:
--   docs/CAREERS_RECRUITMENT_SUPABASE.md
--
-- What this adds:
--   1. Two new application statuses: hold, onboarding
--   2. onboarding_tokens   — magic links (7-day expiry, revocable on resend)
--   3. onboarding_submissions — candidate form (JSON) + HR-only fields (JSON)
--
-- All app access uses the service role via Next.js API routes (no RLS required).
-- =============================================================================

create extension if not exists "pgcrypto";

-- Reuse the updated_at helper from the base careers schema (safe if already exists)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 1) Extend job_applications.status
-- ---------------------------------------------------------------------------
alter table public.job_applications
  drop constraint if exists job_applications_status_check;

alter table public.job_applications
  add constraint job_applications_status_check
  check (status in (
    'applied',
    'under_review',
    'shortlisted',
    'interview',
    'hold',        -- panel decision: reserve / pending
    'onboarding',  -- hire confirmed; candidate completing onboarding form
    'offer',       -- onboarding submitted; offer / pre-start stage
    'rejected'
  ));

comment on column public.job_applications.status is
  'Pipeline: applied → under_review → shortlisted → interview → hold|onboarding|rejected → offer';

-- ---------------------------------------------------------------------------
-- 2) onboarding_tokens — public magic links
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_tokens (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.job_applications(id) on delete cascade,
  token           text not null unique,          -- 64-char hex from app
  expires_at      timestamptz not null,          -- issued_at + 7 days
  created_at      timestamptz not null default now(),
  last_sent_at    timestamptz,                   -- when email was last sent
  revoked_at      timestamptz                    -- set when HR resends a new link
);

create index if not exists onboarding_tokens_application_idx
  on public.onboarding_tokens (application_id);

create index if not exists onboarding_tokens_active_token_idx
  on public.onboarding_tokens (token)
  where revoked_at is null;

comment on table public.onboarding_tokens is
  'One active token per hire at a time; older rows kept with revoked_at for audit.';

-- ---------------------------------------------------------------------------
-- 3) onboarding_submissions — one row per hired candidate
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_submissions (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null unique references public.job_applications(id) on delete cascade,
  token_id              uuid references public.onboarding_tokens(id) on delete set null,

  -- Candidate-facing answers (sections A–N from Employee Onboarding Form)
  form_data             jsonb not null default '{}'::jsonb,

  -- HR-only fields (Section O — edited in Recruitment → Onboarding tab)
  hr_data               jsonb not null default '{}'::jsonb,

  -- Wizard step timestamps (personal → medical → referee)
  personal_completed_at timestamptz,
  medical_completed_at  timestamptz,
  referee_completed_at  timestamptz,

  submitted_at          timestamptz,             -- null until final submit
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists onboarding_submissions_submitted_idx
  on public.onboarding_submissions (submitted_at desc nulls last);

create index if not exists onboarding_submissions_pending_idx
  on public.onboarding_submissions (application_id)
  where submitted_at is null;

drop trigger if exists onboarding_submissions_updated_at on public.onboarding_submissions;
create trigger onboarding_submissions_updated_at
  before update on public.onboarding_submissions
  for each row execute function public.set_updated_at();

comment on table public.onboarding_submissions is
  'One submission per application. form_data = candidate fields; hr_data = Section O.';

comment on column public.onboarding_submissions.form_data is
  'JSON: personal, emergency, employment, payment, qualifications, medical, referees, biosecurity, declarations';

comment on column public.onboarding_submissions.hr_data is
  'JSON: employee_id, company_email, supervisor, salary, fitness, medical/references tracking, etc.';

-- ---------------------------------------------------------------------------
-- Verify (optional — run manually after migration)
-- ---------------------------------------------------------------------------
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.job_applications'::regclass and conname like '%status%';
--
-- select table_name from information_schema.tables
-- where table_schema = 'public' and table_name like 'onboarding%';
