-- ============================================================================
-- Careers — long-form job description sections (Role Scope, Key
-- Responsibilities, Minimum Qualifications, Preferred Qualifications,
-- Experience, Required Skills & Attributes, Non-Negotiable Standards).
--
-- Each is plain text, written in the admin job posting form using a
-- simple shorthand ("# heading", "- bullet", "1. numbered", "*bold*",
-- "_italic_") and formatted for display on the public job details page.
-- All are optional (default ''), so existing postings and postings that
-- only fill in a few sections keep working unchanged.
--
-- Run in Supabase SQL editor after docs/careers/job_postings.sql.
-- ============================================================================

alter table public.job_postings add column if not exists role_scope text not null default '';
alter table public.job_postings add column if not exists key_responsibilities text not null default '';
alter table public.job_postings add column if not exists minimum_qualifications text not null default '';
alter table public.job_postings add column if not exists preferred_qualifications text not null default '';
alter table public.job_postings add column if not exists experience text not null default '';
alter table public.job_postings add column if not exists required_skills_attributes text not null default '';
alter table public.job_postings add column if not exists non_negotiable_standards text not null default '';

NOTIFY pgrst, 'reload schema';
