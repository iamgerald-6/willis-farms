-- ============================================================================
-- Backfill parent_level_id for the required Site -> Business unit ->
-- Department -> Section -> Position chain.
-- Run once, after org-structure-mapping-tree.sql.
--
-- These 5 levels were created before org_mapping_levels had a
-- parent_level_id column, so on an install that already had them, every one
-- comes back parent_level_id = null after the tree migration — which the app
-- reads as "top level, no ancestor," so it stops asking e.g. "which Site is
-- this Business unit under" before letting you pick items.
--
-- This only fills in that missing metadata for the 5 required levels, in
-- their fixed order. It does NOT touch org_mapping_nodes — the actual
-- Site/BU/Department/Section/Position mappings you've already set up are
-- untouched and correct.
--
-- Safe to run more than once — only fills rows that are still null.
-- ============================================================================

with chain as (
  select
    l.id,
    lt.table_name,
    row_number() over (
      order by array_position(
        array['sites', 'business_units', 'departments', 'sections', 'custom_position'],
        lt.table_name
      )
    ) as seq
  from org_mapping_levels l
  join org_custom_list_types lt on lt.id = l.list_type_id
  where lt.table_name in ('sites', 'business_units', 'departments', 'sections', 'custom_position')
)
update org_mapping_levels l
set parent_level_id = prev.id
from chain c
join chain prev on prev.seq = c.seq - 1
where l.id = c.id
  and l.parent_level_id is null;

notify pgrst, 'reload schema';
