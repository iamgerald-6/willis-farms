-- ============================================================================
-- Employee org placement — Site / Business unit / Department / Section /
-- Position / Grade level, stored directly on the employee record.
--
-- Previously only a free-text job_position title existed on users. HR asked
-- for every hired employee to carry the same structured org-structure
-- placement their job posting had (Site/BU/Department/Section/Position),
-- plus Grade level, so it's available everywhere an employee's record is
-- read (Employees tab, appraisal, etc.) without re-deriving it each time
-- from their original application -> job posting.
--
-- These reference the same physical tables job_postings' own org-structure
-- columns point to (see docs/organizational-structure/job-postings-org-fields.sql
-- and org-structure-mapping-real-tables.sql). "on delete set null" rather
-- than cascade — deleting a Site/Department/etc. item should never delete an
-- employee record.
-- ============================================================================

alter table users add column if not exists site_id uuid references sites(id) on delete set null;
alter table users add column if not exists business_unit_id uuid references business_units(id) on delete set null;
alter table users add column if not exists department_id uuid references departments(id) on delete set null;
alter table users add column if not exists section_id uuid references sections(id) on delete set null;
alter table users add column if not exists position_id uuid references custom_position(id) on delete set null;
alter table users add column if not exists grade_level_id uuid references grade_levels(id) on delete set null;

notify pgrst, 'reload schema';
