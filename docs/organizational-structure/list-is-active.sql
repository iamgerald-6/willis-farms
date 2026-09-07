-- ============================================================================
-- Organizational structure: disable/enable a list instead of deleting it
-- Run once in the Supabase SQL editor.
--
-- Set up no longer lets an admin permanently delete a list (and its
-- physical table) from the UI — too easy to lose data by accident,
-- especially once job postings and other features depend on these lists.
-- Instead, a list can be disabled: it's hidden from anywhere it'd be
-- picked for new use (e.g. the Create job posting form's org-structure
-- fields) but its table, data, and any existing references to it are
-- left completely untouched, and it can be re-enabled at any time.
-- ============================================================================

alter table org_custom_list_types
  add column if not exists is_active boolean not null default true;

notify pgrst, 'reload schema';
