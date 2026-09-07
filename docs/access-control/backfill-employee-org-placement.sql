-- ============================================================================
-- One-time backfill: fill in site_id/business_unit_id/department_id/
-- section_id/position_id/grade_level_id for existing employees who already
-- have an application_id (i.e. were hired through the recruitment
-- pipeline), by copying those values from the job posting their
-- application was linked to.
--
-- Run once, after users-org-placement.sql. Safe to re-run — only touches
-- rows where the target column is still null. Employees with no
-- application_id, or whose application has no job_posting_id, or whose
-- posting has no value for a given field, are left as-is (null) — there's
-- nothing to backfill them from.
-- ============================================================================

update users u
set
  site_id = coalesce(u.site_id, jp.site_id),
  business_unit_id = coalesce(u.business_unit_id, jp.business_unit_id),
  department_id = coalesce(u.department_id, jp.department_id),
  section_id = coalesce(u.section_id, jp.section_id),
  position_id = coalesce(u.position_id, jp.position_id),
  grade_level_id = coalesce(u.grade_level_id, jp.grade_level_id)
from job_applications ja
join job_postings jp on jp.id = ja.job_posting_id
where u.application_id = ja.id
  and (
    u.site_id is null
    or u.business_unit_id is null
    or u.department_id is null
    or u.section_id is null
    or u.position_id is null
    or u.grade_level_id is null
  );
