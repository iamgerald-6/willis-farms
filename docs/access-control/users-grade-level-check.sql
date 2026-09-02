-- ============================================================================
-- Allow config-driven grade levels on public.users (consultant + custom grades)
-- Run in Supabase SQL editor after deploying consultant grade app changes.
--
-- Legacy constraint users_grade_level_check only allowed L1–L7. Grades are now
-- defined in System Definitions → Grade levels (including consultant).
-- ============================================================================

alter table public.users drop constraint if exists users_grade_level_check;

notify pgrst, 'reload schema';
