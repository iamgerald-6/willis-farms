-- ============================================================================
-- Job postings: archive
-- Run once in the Supabase SQL editor.
--
-- Lets an admin tuck a posting away from Recruitment without closing or
-- deleting it — e.g. a role that's on pause but might reopen later.
-- Archived postings are hidden from the Recruitment page entirely and
-- from Create job posting's main table, but stay reachable from Create
-- job posting's Archive tab, where they can be unarchived at any time.
-- Nothing about the posting's own data changes; archiving/unarchiving
-- only sets or clears this timestamp.
-- ============================================================================

alter table job_postings
  add column if not exists archived_at timestamptz;

notify pgrst, 'reload schema';
