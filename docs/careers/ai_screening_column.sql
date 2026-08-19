-- ============================================================================
-- Careers — AI shortlisting. Stores the AI's match score + rationale for
-- each application once graded, so the admin UI and the daily digest can
-- both read it without re-running the AI.
-- ============================================================================

alter table public.job_applications add column if not exists ai_screening jsonb;

NOTIFY pgrst, 'reload schema';
