-- ============================================================================
-- Job postings: min/max columns for numeric-range org-structure lists
-- Run once in the Supabase SQL editor, AFTER
-- docs/organizational-structure/job-postings-org-fields.sql.
--
-- This only applies to numeric-range lists in "digits" mode (each item is
-- one whole number, e.g. Age: 15, 16, 17...) — those can be filled on a
-- job posting either as a single value or as a range (a minimum and a
-- maximum, each still a real foreign key into the list's own table, e.g.
-- age_min_id/age_max_id -> custom_age(id), not a raw number).
--
-- It deliberately does NOT apply to "bands" mode (e.g. Salary: each item
-- is already its own range, like "1000-2000") — picking a minimum and
-- maximum band doesn't mean anything extra there; a single band selection
-- already is the range. If this migration was run before that distinction
-- was made, the cleanup block at the bottom removes Salary's min/max
-- columns; safe to run again either way.
--
-- org_custom_list_types gains job_posting_min_column/job_posting_max_column,
-- populated only for digits-mode numeric-range lists (null for everything
-- else, including bands-mode lists).
-- ============================================================================

alter table org_custom_list_types
  add column if not exists job_posting_min_column text,
  add column if not exists job_posting_max_column text;

-- Backfill: Age is the one digits-mode numeric-range list that exists
-- today. Reuses add_job_posting_org_column from job-postings-org-fields.sql
-- — it already validates identifiers and is SECURITY DEFINER, so no new
-- RPC function is needed here.
select add_job_posting_org_column('age_min_id', 'custom_age');
select add_job_posting_org_column('age_max_id', 'custom_age');

update org_custom_list_types
  set job_posting_min_column = 'age_min_id', job_posting_max_column = 'age_max_id'
  where table_name = 'custom_age';

-- Cleanup, in case an earlier run of this file added Salary's min/max
-- columns before "bands" lists were excluded — no-op if they were never
-- created.
select drop_job_posting_org_column('salary_min_id');
select drop_job_posting_org_column('salary_max_id');

update org_custom_list_types
  set job_posting_min_column = null, job_posting_max_column = null
  where table_name = 'custom_salary';

notify pgrst, 'reload schema';
