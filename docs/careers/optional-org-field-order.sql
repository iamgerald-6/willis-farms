-- ============================================================================
-- Remember the order optional org-structure fields were added to each
-- posting, instead of deriving it from each list's own sort_order.
--
-- Site/Business unit/Department/Section/Position are always shown and
-- always required, so they never need this — only the opt-in fields
-- (Grade level, Employment type, Age, Salary, ...) did. Without a real
-- place to store "which order did the HR add these," reopening a posting
-- to edit it fell back to ordering already-populated optional fields by
-- their list's own sort_order — so a field created early in Org structure
-- Set up (e.g. Salary) would always jump to the front of the added group
-- on reopen, no matter when it was actually added to that posting.
--
-- Run once in the Supabase SQL editor, then: NOTIFY pgrst, 'reload schema';
-- ============================================================================

alter table job_postings
  add column if not exists optional_org_field_order jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';
