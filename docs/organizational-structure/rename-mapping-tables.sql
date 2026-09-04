-- ============================================================================
-- Organizational structure — rename mapping tables to readable names
-- Run once in the Supabase SQL editor, after
-- docs/organizational-structure/dynamic-mapping-tables.sql.
--
-- New mapping groups are now named after the two lists they link (e.g.
-- "mapping_sections_positions") instead of the group's id
-- ("mapping_0d6bf1dd_5406_..."). This renames every existing mapping
-- table to match, using ALTER TABLE ... RENAME TO — instant, and keeps
-- all existing data and constraints intact.
-- ============================================================================

do $$
declare
  grp record;
  parent_label text;
  child_label text;
  base_name text;
  new_name text;
  suffix int;
begin
  for grp in select * from org_mapping_groups loop
    if grp.parent_list_key like 'custom:%' then
      select label into parent_label from org_custom_list_types
      where id = split_part(grp.parent_list_key, ':', 2)::uuid;
    else
      parent_label := case grp.parent_list_key
        when 'sites' then 'Sites'
        when 'business-units' then 'Business units'
        when 'departments' then 'Departments divisions'
        when 'sections' then 'Sections'
        when 'grade-levels' then 'Grade levels'
        else grp.parent_list_key
      end;
    end if;

    if grp.child_list_key like 'custom:%' then
      select label into child_label from org_custom_list_types
      where id = split_part(grp.child_list_key, ':', 2)::uuid;
    else
      child_label := case grp.child_list_key
        when 'sites' then 'Sites'
        when 'business-units' then 'Business units'
        when 'departments' then 'Departments divisions'
        when 'sections' then 'Sections'
        when 'grade-levels' then 'Grade levels'
        else grp.child_list_key
      end;
    end if;

    base_name := substring(
      'mapping_' || regexp_replace(lower(trim(coalesce(parent_label, grp.parent_list_key))), '[^a-z0-9]+', '_', 'g')
      || '_' || regexp_replace(lower(trim(coalesce(child_label, grp.child_list_key))), '[^a-z0-9]+', '_', 'g')
      from 1 for 55
    );
    base_name := regexp_replace(base_name, '_+$', '');

    new_name := base_name;
    suffix := 2;
    while exists (
      select 1 from org_mapping_groups where table_name = new_name and id <> grp.id
    ) loop
      new_name := base_name || '_' || suffix;
      suffix := suffix + 1;
    end loop;

    if new_name <> grp.table_name then
      execute format('alter table %I rename to %I', grp.table_name, new_name);
      execute format(
        'alter index if exists %I rename to %I',
        grp.table_name || '_parent_idx', new_name || '_parent_idx'
      );
      execute format(
        'alter index if exists %I rename to %I',
        grp.table_name || '_child_idx', new_name || '_child_idx'
      );
      update org_mapping_groups set table_name = new_name where id = grp.id;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
