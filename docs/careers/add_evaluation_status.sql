-- Adds "evaluation" as an allowed value for job_applications.status.
-- Status now flips to "evaluation" automatically once the interview panel's
-- evaluation stage is finalized (previously it stayed on "interview").
-- Run this in Supabase SQL editor.

alter table public.job_applications
  drop constraint if exists job_applications_status_check;

alter table public.job_applications
  add constraint job_applications_status_check
  check (status in (
    'applied',
    'under_review',
    'shortlisted',
    'interview',
    'evaluation',
    'hold',
    'onboarding',
    'offer',
    'rejected'
  ));
