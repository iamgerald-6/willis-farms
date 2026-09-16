-- ============================================================================
-- Drop unused legacy org-structure tables (and their constraints)
-- Run ONCE in the Supabase SQL editor. Read the whole file before running it.
--
-- These are leftovers from three earlier, retired designs of the
-- organizational structure feature. Each was superseded by a later
-- generation and confirmed to have ZERO references anywhere in the current
-- TypeScript codebase (grepped fresh, not just taken from doc comments —
-- docs previously turned out to be wrong about org_site_business_units
-- still existing, so this list was re-verified against actual code).
--
-- Generation 1 — hardcoded, fixed 4-level chain (Site -> Business unit ->
-- Department -> Section), from org-structure-mapping.sql /
-- site-business-units.sql:
--   org_site_business_units, org_business_unit_departments,
--   org_department_sections, org_section_positions, site_business_units,
--   business_unit_departments, department_sections
--
-- Generation 2 — generic per-group mapping tables ("Mapping set up"
-- feature), from mapping-groups.sql / dynamic-mapping-tables.sql:
--   org_mapping_groups, org_structure_mappings, and the per-group junction
--   tables it created (mapping_sites_business_units,
--   mapping_business_units_departments_divisions,
--   mapping_departments_divisions_sections, mapping_sections_position,
--   mapping_position_grade_levels, mapping_grade_levels_salary)
--
-- Generation 3-ish — org_custom_list_items, superseded by real per-list
-- custom_<slug> tables (dynamic-list-tables.sql). The two places that still
-- mention its name in TS are just React Query cache-key strings, not
-- queries against the table itself — the actual fetch goes through each
-- list's own custom_<slug> table.
--
-- NOT included, deliberately still active:
--   org_mapping_levels, org_mapping_nodes — org_mapping_nodes is still
--     read/written by src/app/api/organizational-structure/mapping-nodes/
--     and mapping-levels/ routes, for root-level (no-parent) checkbox
--     mappings. Do not drop this.
--   org_map_<list> tables (org_map_business_units, org_map_departments,
--     etc.) — the current, live per-level mapping tables.
--   sites, business_units, departments, sections, grade_levels,
--     custom_position, custom_age, custom_salary, every custom_<slug>
--     table, users, job_postings, appraisal_grade_templates,
--     skill_log_templates — all active.
--
-- SAFETY: every DROP uses IF EXISTS (so it's harmless if something on this
-- list already doesn't exist in your database) and CASCADE (so each
-- table's own constraints — its FKs to the tables above it in a dead
-- chain, or from a dead per-group table's FK to org_mapping_groups — go
-- with it, rather than blocking the drop). Wrapped in one transaction: if
-- anything unexpected happens, everything rolls back. This is still
-- genuinely irreversible once committed — take a fresh backup / confirm
-- PITR is available first, and everything below is scoped to tables with
-- zero live code references, not anything currently in use.
-- ============================================================================

begin;

-- Generation 2 child (per-group) junction tables first — no dependents of
-- their own, but tidiest to clear before the parent tables they point at.
drop table if exists mapping_sites_business_units cascade;
drop table if exists mapping_business_units_departments_divisions cascade;
drop table if exists mapping_departments_divisions_sections cascade;
drop table if exists mapping_sections_position cascade;
drop table if exists mapping_position_grade_levels cascade;
drop table if exists mapping_grade_levels_salary cascade;

-- Generation 2 parents
drop table if exists org_structure_mappings cascade;
drop table if exists org_mapping_groups cascade;

-- Generation 1 chain — dropped leaf-first (Section before Department before
-- Business unit before Site) even though CASCADE would handle any order;
-- reads cleanest this way.
drop table if exists org_section_positions cascade;
drop table if exists org_department_sections cascade;
drop table if exists org_business_unit_departments cascade;
drop table if exists org_site_business_units cascade;
drop table if exists department_sections cascade;
drop table if exists business_unit_departments cascade;
drop table if exists site_business_units cascade;

-- Superseded custom-list storage
drop table if exists org_custom_list_items cascade;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER RUNNING: confirm nothing unexpected was pulled in by a CASCADE —
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name in (
--     'mapping_sites_business_units',
--     'mapping_business_units_departments_divisions',
--     'mapping_departments_divisions_sections',
--     'mapping_sections_position',
--     'mapping_position_grade_levels',
--     'mapping_grade_levels_salary',
--     'org_structure_mappings', 'org_mapping_groups',
--     'org_section_positions', 'org_department_sections',
--     'org_business_unit_departments', 'org_site_business_units',
--     'department_sections', 'business_unit_departments',
--     'site_business_units', 'org_custom_list_items'
--   );
-- (should return zero rows)
--
-- and then open Set up / Org structure mapping, custom lists, Job
-- postings, Appraisal templates, and Skill Log templates in the app to
-- confirm everything still works as before — none of them should have
-- touched these tables, but worth the quick check.
-- ============================================================================
