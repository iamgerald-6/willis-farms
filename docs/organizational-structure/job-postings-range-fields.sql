-- ============================================================================
-- Job postings: min/max columns for numeric-range org-structure lists
-- Run once in the Supabase SQL editor, AFTER
-- docs/organizational-structure/job-postings-org-fields.sql.
--
-- Numeric-range lists (Age, Salary, and any future one with
-- is_numeric_range = true) can now be filled on a job posting either as a
-- single value (the existing job_posting_column) or as a range — a
-- minimum and a maximum, each still a real foreign key into the list's
-- own table (age_min_id/age_max_id -> custom_age(id), etc.), not a raw
-- number. Which mode a given posting used is decided at save time by
-- which columns are populated; both are always nullable, and the API
-- clears whichever one isn't in use.
--
-- org_custom_list_types gains job_posting_min_column/job_posting_max_column,
-- populated only for is_numeric_range lists (null for everything else —
-- the "single or range" choice only makes sense for a numeric-range list).
-- ============================================================================

alter table org_custom_list_types
  add column if not exists job_posting_min_column text,
  add column if not exists job_posting_max_column text;

-- Backfill: Age and Salary are the two numeric-range lists that exist
-- today. Reuses add_job_posting_org_column from job-postings-org-fields.sql
-- — it already validates identifiers and is SECURITY DEFINER, so no new
-- RPC function is needed here.
select add_job_posting_org_column('age_min_id', 'custom_age');
select add_job_posting_org_column('age_max_id', 'custom_age');
select add_job_posting_org_column('salary_min_id', 'custom_salary');
select add_job_posting_org_column('salary_max_id', 'custom_salary');

update org_custom_list_types
  set job_posting_min_column = 'age_min_id', job_posting_max_column = 'age_max_id'
  where table_name = 'custom_age';

update org_custom_list_types
  set job_posting_min_column = 'salary_min_id', job_posting_max_column = 'salary_max_id'
  where table_name = 'custom_salary';

notify pgrst, 'reload schema';
