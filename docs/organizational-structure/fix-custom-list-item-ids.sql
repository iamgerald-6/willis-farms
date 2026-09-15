-- ============================================================================
-- Fix: restore original IDs on custom list items
-- Run once in the Supabase SQL editor.
--
-- docs/organizational-structure/dynamic-list-tables.sql copied every custom
-- list's items (e.g. Positions) into its own new table, but that copy let
-- Postgres generate a brand new id for each row instead of keeping the
-- original one. Any mapping created before that migration (e.g. Sections &
-- Positions) still points at the *original* ids, so those mappings now show
-- "Unknown" — the position they're pointing at, by that id, no longer
-- exists.
--
-- This restores each row's original id, matched by `code` (unique within
-- one list, and unchanged by the earlier migration) against the org_
-- custom_list_items snapshot. It only touches rows that still have their
-- original code from before the migration — anything you've added since
-- then already has the correct id and is left alone.
-- ============================================================================

do $$
declare
  lt record;
  item record;
begin
  for lt in select * from org_custom_list_types loop
    for item in select * from org_custom_list_items where list_type_id = lt.id loop
      execute format(
        'update %I set id = %L where code = %L and id <> %L',
        lt.table_name, item.id, item.code, item.id
      );
    end loop;
  end loop;
end $$;

notify pgrst, 'reload schema';
