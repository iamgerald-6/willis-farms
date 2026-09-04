-- ============================================================================
-- Organizational structure — real column names on mapping tables
-- Run once in the Supabase SQL editor, after
-- docs/organizational-structure/rename-mapping-tables.sql.
--
-- Every mapping table used generic parent_row_id/child_row_id columns.
-- This renames them to match the list they point at — e.g. "Sections &
-- Positions" becomes columns section_id/position_id — same convention the
-- original site_business_units table used (site_id, business_unit_id).
-- ============================================================================

alter table org_mapping_groups add column if not exists parent_column text;
alter table org_mapping_groups add column if not exists child_column text;

drop function if exists create_org_dynamic_mapping_table(text);

-- Creates the physical junction table for one mapping group, with real
-- column names (e.g. section_id, position_id) instead of generic
-- parent_row_id/child_row_id. No foreign keys — the referenced list varies
-- per group (fixed or custom), so validity is enforced in the Next.js API
-- route instead, same as the rest of Organizational Structure.
create or replace function create_org_dynamic_mapping_table(
  p_table_name text,
  p_parent_column text,
  p_child_column text
)
returns void as $$
begin
  if p_table_name !~ '^[a-z][a-z0-9_]{2,62}$' then
    raise exception 'Invalid table name: %', p_table_name;
  end if;
  if p_parent_column !~ '^[a-z][a-z0-9_]{2,50}$' then
    raise exception 'Invalid parent column name: %', p_parent_column;
  end if;
  if p_child_column !~ '^[a-z][a-z0-9_]{2,50}$' then
    raise exception 'Invalid child column name: %', p_child_column;
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = p_table_name
  ) then
    raise exception 'Table already exists: %', p_table_name;
  end if;

  execute format(
    'create table %I (
       id uuid primary key default gen_random_uuid(),
       %I uuid not null,
       %I uuid not null,
       created_at timestamptz not null default now(),
       unique (%I, %I)
     )',
    p_table_name, p_parent_column, p_child_column, p_parent_column, p_child_column
  );

  execute format(
    'create index %I on %I (%I)',
    p_table_name || '_' || p_parent_column || '_idx', p_table_name, p_parent_column
  );
  execute format(
    'create index %I on %I (%I)',
    p_table_name || '_' || p_child_column || '_idx', p_table_name, p_child_column
  );
end;
$$ language plpgsql;

-- One-time migration: rename parent_row_id/child_row_id on every existing
-- mapping table to real names derived from the two lists it links.
do $$
declare
  grp record;
  parent_singular text;
  child_singular text;
  parent_col text;
  child_col text;
begin
  for grp in select * from org_mapping_groups loop
    if grp.parent_list_key like 'custom:%' then
      select singular into parent_singular from org_custom_list_types
      where id = split_part(grp.parent_list_key, ':', 2)::uuid;
    else
      parent_singular := case grp.parent_list_key
        when 'sites' then 'site'
        when 'business-units' then 'business_unit'
        when 'departments' then 'department'
        when 'sections' then 'section'
        when 'grade-levels' then 'grade_level'
        else grp.parent_list_key
      end;
    end if;

    if grp.child_list_key like 'custom:%' then
      select singular into child_singular from org_custom_list_types
      where id = split_part(grp.child_list_key, ':', 2)::uuid;
    else
      child_singular := case grp.child_list_key
        when 'sites' then 'site'
        when 'business-units' then 'business_unit'
        when 'departments' then 'department'
        when 'sections' then 'section'
        when 'grade-levels' then 'grade_level'
        else grp.child_list_key
      end;
    end if;

    parent_col := regexp_replace(lower(trim(coalesce(parent_singular, 'parent'))), '[^a-z0-9]+', '_', 'g') || '_id';
    child_col := regexp_replace(lower(trim(coalesce(child_singular, 'child'))), '[^a-z0-9]+', '_', 'g') || '_id';

    if parent_col = child_col then
      child_col := child_col || '_2';
    end if;

    if grp.parent_column is null then
      execute format('alter table %I rename column parent_row_id to %I', grp.table_name, parent_col);
      execute format('alter table %I rename column child_row_id to %I', grp.table_name, child_col);
      update org_mapping_groups set parent_column = parent_col, child_column = child_col where id = grp.id;
    end if;
  end loop;
end $$;

alter table org_mapping_groups alter column parent_column set not null;
alter table org_mapping_groups alter column child_column set not null;

notify pgrst, 'reload schema';
