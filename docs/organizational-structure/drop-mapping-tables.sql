-- ============================================================================
-- Organizational structure — retire the Mapping set up feature entirely
-- Run once in the Supabase SQL editor.
--
-- Mapping set up (pairwise list-to-list mappings) is being replaced by the
-- "Create job posting" tab, which links a posting directly to one value
-- per org-structure list via real foreign key columns instead. Nothing in
-- the app reads these tables anymore once that ships, so this drops:
--
--   1. Every active mapping group's own table (the 6 in use today).
--   2. org_mapping_groups — the registry table that tracked them.
--   3. The 3 original hardcoded junction tables from before the dynamic
--      mapping-groups system existed (site_business_units,
--      business_unit_departments, department_sections) — unused since
--      their data was copied into the mapping_* tables.
--
-- The org-structure LIST tables themselves (sites, business_units,
-- departments, sections, grade_levels, custom_positions, custom_salary,
-- etc.) are NOT touched — only the mapping layer between them goes.
--
-- Irreversible. Double-check the table names below still match what's in
-- your database (see the org_mapping_groups query you already ran) before
-- running this.
-- ============================================================================

drop table if exists mapping_sites_business_units cascade;
drop table if exists mapping_business_units_departments_divisions cascade;
drop table if exists mapping_departments_divisions_sections cascade;
drop table if exists mapping_sections_position cascade;
drop table if exists mapping_position_grade_levels cascade;
drop table if exists mapping_grade_levels_salary cascade;

drop table if exists org_mapping_groups cascade;

drop table if exists site_business_units cascade;
drop table if exists business_unit_departments cascade;
drop table if exists department_sections cascade;

-- The dynamic-mapping-table RPC functions (create/drop_org_dynamic_mapping_table)
-- are no longer called by the app once Mapping set up is removed, but are
-- left in place rather than dropped here — harmless if unused, and safer
-- than risking a mismatch with when the app code actually stops calling them.

notify pgrst, 'reload schema';
