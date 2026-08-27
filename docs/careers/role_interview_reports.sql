-- Stores the AI-generated, per-role "hiring summary" report used on the
-- Approvals tab — one row per role, combining every applicant's individual
-- interview report/funnel data for that role into a single consolidated
-- report HR can review, edit, download, and email. Mirrors the "generate
-- once, edit unlimited, log every edit" model already used for
-- job_applications.interview_form_data.summary.interview_report.
-- Run this in the Supabase SQL editor.

create table if not exists public.role_interview_reports (
  id uuid primary key default gen_random_uuid(),
  role_slug text not null unique,
  role_title text not null,
  report jsonb not null,
  report_edit jsonb,
  report_edit_log jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  generated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists role_interview_reports_role_slug_idx
  on public.role_interview_reports (role_slug);

-- ============================================================================
-- Scope reports per hiring round instead of per role forever.
--
-- Previously role_slug was unique, so a role could only ever have ONE saved
-- report, and reopening a role for a new round would silently pull EVERY
-- applicant who ever applied under that role name — old, already-decided
-- rounds included — into the "current" report.
--
-- job_posting_id ties a report to the specific job_postings row (= one
-- hiring round). Existing rows are left with job_posting_id = null and keep
-- working exactly as before (still reachable by role_slug) — nothing about
-- already-generated reports changes. Going forward, every new report is
-- generated against a specific job_posting_id: regenerating within the same
-- round overwrites that round's row (job_posting_id stays unique), but a
-- newly reopened round gets its own separate row.
-- Run this in the Supabase SQL editor.
-- ============================================================================

alter table public.role_interview_reports
  add column if not exists job_posting_id uuid references public.job_postings(id) on delete set null;

alter table public.role_interview_reports
  drop constraint if exists role_interview_reports_role_slug_key;

create unique index if not exists role_interview_reports_job_posting_id_key
  on public.role_interview_reports (job_posting_id)
  where job_posting_id is not null;

create index if not exists role_interview_reports_job_posting_id_idx
  on public.role_interview_reports (job_posting_id);

comment on column public.role_interview_reports.job_posting_id is
  'The specific hiring round (job_postings row) this report covers. Null on reports generated before this column existed — those are legacy, role-wide reports.';

notify pgrst, 'reload schema';
