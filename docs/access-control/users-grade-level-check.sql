-- ============================================================================
-- Allow config-driven grade levels on public.users (custom L8+ grades)
-- Run in Supabase SQL editor when inviting users with grades outside L1–L7.
--
-- Legacy constraint users_grade_level_check only allowed L1–L7. Grades are now
-- defined in System Definitions → Grade levels.
-- ============================================================================

alter table public.users drop constraint if exists users_grade_level_check;

notify pgrst, 'reload schema';
