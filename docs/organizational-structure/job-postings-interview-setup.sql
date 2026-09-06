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

-- ============================================================================
-- Per-posting interview setup, part 2: same tab set as Interview under
-- Recruitment (screening, questions, scenarios, evaluation checklist,
-- rating scale, score benchmarks, extra stages) — but scoped to this one
-- posting rather than a shared grade-level guide. Stored as one JSON blob
-- rather than a column per field, mirroring how the shared version is
-- stored in the Recruitment module's own business_logic config. Shape:
-- { screening: [], questions: [], scenarios: [], disqualifiers: [],
--   ratingLabels: {}, evaluationLabels: {}, benchmarks: {}, extraStages: [] }
-- — see src/lib/careers/postingInterviewSetup.ts.
-- ============================================================================

alter table job_postings
  add column if not exists interview_setup jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
