-- ============================================================================
-- Age catalog — digits fill on Manage, eligibility on org mapping
--
-- custom_age: min/max on Manage fills one row per year (33, 34, 35… not 33-60).
-- org_map_custom_age: min/max dropdowns per position path for job eligibility.
-- No age columns on job_postings.
--
-- Run once. Safe to re-run (drops posting columns if they exist).
-- ============================================================================

update org_custom_list_types
set
  is_numeric_range = true,
  numeric_range_mode = 'digits',
  job_posting_column = null,
  job_posting_min_column = null,
  job_posting_max_column = null
where table_name = 'custom_age';

select drop_job_posting_org_column('age_id');
select drop_job_posting_org_column('age_min_id');
select drop_job_posting_org_column('age_max_id');

notify pgrst, 'reload schema';
