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
