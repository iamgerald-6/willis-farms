-- ============================================================================
-- Organizational structure — Mapping set up (dynamic groups)
-- Run once in the Supabase SQL editor, after docs/organizational-structure/
-- schema.sql. Replaces the fixed Site<->Business unit / Business unit<->
-- Department / Department<->Section junction tables with a system that lets
-- an admin create a new mapping between ANY two Organizational Structure
-- lists from the Mapping set up page itself.
--
-- org_mapping_groups  — one row per accordion panel on the Mapping set up
--   page (e.g. "Sites & business units"). parent_list_key/child_list_key
--   are the OrgStructureListKey values from src/lib/organizationalStructure.ts
--   ("sites" | "business-units" | "departments" | "sections" | "grade-levels").
-- org_structure_mappings — the actual parent<->child links for a group.
--   parent_row_id/child_row_id point at rows in whichever org structure
--   table the group's list keys resolve to — there's no foreign key here
--   (the referenced table varies per group), so validity is enforced in
--   the Next.js API route instead, same no-RLS / checks-in-code pattern as
--   the rest of Organizational Structure.
--
-- No Postgres RLS — Next.js API routes use the service-role key and
-- enforce access in code.
-- ============================================================================

create table if not exists org_mapping_groups (
  id uuid primary key default gen_random_uuid(),
  parent_list_key text not null,
  child_list_key text not null,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (parent_list_key, child_list_key)
);

create index if not exists org_mapping_groups_sort_order_idx
  on org_mapping_groups (sort_order);

create table if not exists org_structure_mappings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references org_mapping_groups(id) on delete cascade,
  parent_row_id uuid not null,
  child_row_id uuid not null,
  created_at timestamptz not null default now(),
  unique (group_id, parent_row_id, child_row_id)
);

create index if not exists org_structure_mappings_group_id_idx
  on org_structure_mappings (group_id);
create index if not exists org_structure_mappings_parent_row_id_idx
  on org_structure_mappings (parent_row_id);
create index if not exists org_structure_mappings_child_row_id_idx
  on org_structure_mappings (child_row_id);

-- Seed the 3 groups already used in the app so nothing disappears from the
-- Mapping set up page after this migration runs.
insert into org_mapping_groups (parent_list_key, child_list_key, title, sort_order)
values
  ('sites', 'business-units', 'Sites & business units', 0),
  ('business-units', 'departments', 'Business units & departments', 1),
  ('departments', 'sections', 'Departments & sections', 2)
on conflict (parent_list_key, child_list_key) do nothing;

-- Carry over any mappings already entered under the old fixed tables, if
-- they exist. Safe to run even if you have no data yet — each insert is a
-- no-op when its source table is empty.
insert into org_structure_mappings (group_id, parent_row_id, child_row_id, created_at)
select g.id, m.site_id, m.business_unit_id, m.created_at
from site_business_units m
join org_mapping_groups g
  on g.parent_list_key = 'sites' and g.child_list_key = 'business-units'
on conflict (group_id, parent_row_id, child_row_id) do nothing;

insert into org_structure_mappings (group_id, parent_row_id, child_row_id, created_at)
select g.id, m.business_unit_id, m.department_id, m.created_at
from business_unit_departments m
join org_mapping_groups g
  on g.parent_list_key = 'business-units' and g.child_list_key = 'departments'
on conflict (group_id, parent_row_id, child_row_id) do nothing;

insert into org_structure_mappings (group_id, parent_row_id, child_row_id, created_at)
select g.id, m.department_id, m.section_id, m.created_at
from department_sections m
join org_mapping_groups g
  on g.parent_list_key = 'departments' and g.child_list_key = 'sections'
on conflict (group_id, parent_row_id, child_row_id) do nothing;

notify pgrst, 'reload schema';

-- Once you've confirmed the data above carried over correctly, the old
-- fixed tables are no longer used by the app and can be dropped. Not run
-- automatically — only do this once you're sure, since it's irreversible:
--
-- drop table if exists site_business_units cascade;
-- drop table if exists business_unit_departments cascade;
-- drop table if exists department_sections cascade;
