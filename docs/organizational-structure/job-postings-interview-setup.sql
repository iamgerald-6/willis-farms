-- ============================================================================
-- Job postings: per-posting interview setup
-- Run once in the Supabase SQL editor.
--
-- The Interview step on Create job posting no longer edits the shared,
-- grade-level interview guide library (InterviewGuidesEditor / L1-L7+
-- configs) — it now captures interview details specific to THIS one
-- posting: a description of what the interview covers, a free-text list
-- of recommended panel members, and an approximate duration in minutes.
-- ============================================================================

alter table job_postings
  add column if not exists interview_description text,
  add column if not exists interview_panel_members text,
  add column if not exists interview_duration_minutes integer;

notify pgrst, 'reload schema';
