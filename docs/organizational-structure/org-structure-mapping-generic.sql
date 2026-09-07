-- ============================================================================
-- Org structure mapping set up — generic version
-- Run once in the Supabase SQL editor.
--
-- Replaces the fixed 4-level version (org-structure-mapping.sql — safe to
-- run this even if that one was never run, or already was; the drops below
-- are no-ops if those tables don't exist). That version hardcoded the chain
-- to Site -> Business unit -> Department -> Section -> Position. This
-- version lets an admin add ANY org-structure list as a level in the chain,
-- in whatever order they add them — Create job posting still only treats
-- Site/Business unit/Department/Section/Position as its always-required
-- cascading fields (see fetchOrgMappingContext.ts), but the mapping tool
-- itself isn't limited to those five.
--
-- org_mapping_levels — which lists currently participate in the chain, and
-- in what order (position 1 = first/root, no parent above it).
--
-- org_mapping_nodes — one row per "this item is valid under this specific
-- parent item" fact. A level-1 item's node has parent_node_id null (it's
-- just marked as in use). A level-2+ item's node points at the exact
-- parent-level node it's valid under — and since that parent node already
-- points at its own parent, the full path back to level 1 is always
-- reconstructable by walking parent_node_id up, however many levels deep
-- the chain currently goes. Deleting a level, or a node, cascades to
-- everything mapped underneath it via the two on-delete-cascade FKs below.
-- ============================================================================

drop table if exists org_section_positions;
drop table if exists org_department_sections;
drop table if exists org_business_unit_departments;
drop table if exists org_site_business_units;

create table if not exists org_mapping_levels (
  id uuid primary key default gen_random_uuid(),
  list_type_id uuid not null unique references org_custom_list_types(id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default now()
);
create index if not exists org_mapping_levels_position_idx on org_mapping_levels (position);

create table if not exists org_mapping_nodes (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references org_mapping_levels(id) on delete cascade,
  item_id uuid not null,
  parent_node_id uuid references org_mapping_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (level_id, item_id, parent_node_id)
);
create index if not exists org_mapping_nodes_level_idx on org_mapping_nodes (level_id);
create index if not exists org_mapping_nodes_parent_idx on org_mapping_nodes (parent_node_id);

notify pgrst, 'reload schema';
