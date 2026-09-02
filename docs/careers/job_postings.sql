-- ============================================================================
-- Careers — job postings + extended job applications
-- Run in Supabase SQL editor after job_applications exists.
-- ============================================================================
--
-- Already have job_postings? Run ONLY this block first, then retry the app:
--
--   alter table public.job_postings add column if not exists job_title_key text;
--   alter table public.job_postings add column if not exists status text not null default 'published';
--   alter table public.job_postings drop constraint if exists job_postings_status_check;
--   alter table public.job_postings add constraint job_postings_status_check check (status in ('published', 'closed'));
--   update public.job_postings set status = case when is_active = false then 'closed' else 'published' end;
--   NOTIFY pgrst, 'reload schema';
--
-- ============================================================================

create table if not exists public.job_postings (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  job_title_key       text,
  title               text not null,
  location            text not null default 'Eastern Region, Ghana',
  employment_type     text not null default 'Full-time',
  summary             text not null,
  description         text not null,
  interview_guide_key text not null default 'L1'
    check (interview_guide_key in (
      'L1','L2','L3','L4','L5','L6','L7','consultant','data_analyst','veterinarian'
    )),
  jd_file_url         text,
  jd_file_public_id   text,
  closes_at           timestamptz not null,
  status              text not null default 'published'
    check (status in ('published', 'closed')),
  is_active           boolean not null default true,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists job_postings_active_idx
  on public.job_postings (is_active, closes_at desc);

create index if not exists job_postings_status_idx
  on public.job_postings (status, closes_at desc);

alter table public.job_postings
  add column if not exists status text not null default 'published'
  check (status in ('published', 'closed'));

update public.job_postings
set status = case when is_active = false then 'closed' else 'published' end
where status is null;

drop trigger if exists job_postings_updated_at on public.job_postings;
create trigger job_postings_updated_at
  before update on public.job_postings
  for each row execute function public.set_updated_at();

alter table public.job_postings
  add column if not exists job_title_key text;

create index if not exists job_postings_job_title_key_idx
  on public.job_postings (job_title_key);

-- Extend job_applications for multi-step apply flow
alter table public.job_applications
  add column if not exists job_posting_id uuid references public.job_postings(id) on delete set null;

alter table public.job_applications
  add column if not exists application_form_data jsonb not null default '{}'::jsonb;

alter table public.job_applications
  add column if not exists submission_status text not null default 'submitted';

alter table public.job_applications
  drop constraint if exists job_applications_submission_status_check;

alter table public.job_applications
  add constraint job_applications_submission_status_check
  check (submission_status in ('draft', 'submitted'));

alter table public.job_applications
  add column if not exists draft_token text unique;

create index if not exists job_applications_submission_status_idx
  on public.job_applications (submission_status);

create index if not exists job_applications_draft_token_idx
  on public.job_applications (draft_token)
  where draft_token is not null;

comment on table public.job_postings is
  'HR-managed career postings. status=closed hides from public /careers; records stay for HR.';

comment on column public.job_postings.status is
  'published = visible on public careers; closed = hidden from public (deadline passed or HR closed).';

comment on column public.job_applications.submission_status is
  'draft = saved but not submitted; submitted = visible in HR applications inbox.';

alter table public.job_applications
  add column if not exists application_form_fields_snapshot jsonb;

comment on column public.job_applications.application_form_fields_snapshot is
  'Frozen job application form definition when the applicant first saves. Later system definition changes do not affect this application.';

-- ============================================================================
-- Reopening a closed posting now creates a brand-new posting row (its own
-- id, own closing date) instead of flipping the closed one's status back to
-- published in place. superseded_by links the OLD posting to whichever new
-- posting replaced it, so the HR postings list can hide it — it would
-- otherwise sit there alongside its replacement looking like a duplicate.
-- The old row (and its applicants, and any report generated for it) is
-- never deleted or modified beyond this one link.
-- Run this in the Supabase SQL editor.
-- ============================================================================

alter table public.job_postings
  add column if not exists superseded_by uuid references public.job_postings(id) on delete set null;

create index if not exists job_postings_superseded_by_idx
  on public.job_postings (superseded_by);

comment on column public.job_postings.superseded_by is
  'Set on an old, closed posting once it is reopened as a new posting — points at the new posting that replaced it. Null means still current (or never reopened).';

-- ============================================================================
-- Per-posting history log — when it was opened (or, if it replaced a closed
-- posting, republished) and closed, and by whom. Since a superseded posting
-- drops off the HR list (see above), its own "republished" moment wouldn't
-- be visible there — so that event is recorded as the NEW posting's first
-- history entry instead ("republished" rather than "opened"), not on the
-- old one.
-- Run this in the Supabase SQL editor.
-- ============================================================================

alter table public.job_postings
  add column if not exists history jsonb not null default '[]'::jsonb;

comment on column public.job_postings.history is
  'Array of {event: "opened"|"republished"|"closed", at, by: {user_id, name, email}}, oldest first.';

-- Refresh PostgREST schema cache after adding columns
notify pgrst, 'reload schema';
