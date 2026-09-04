-- ============================================================================
-- Organizational structure — Set up: real tables for custom lists
-- Run once in the Supabase SQL editor, after docs/organizational-structure/
-- custom-lists.sql has already been run at least once (this migration
-- upgrades that feature and migrates any data you've already entered).
--
-- What changes: previously every custom list an admin created from Set up
-- shared one table (org_custom_list_items) with a JSONB column for extra
-- fields. Now each custom list gets its own real Postgres table — same
-- pattern as sites, business_units, departments, sections, grade_levels —
-- named "custom_<slug>". org_custom_list_types stays as the registry (one
-- row per custom list, recording its table name and field definitions so
-- the app knows what columns exist).
--
-- Table/column names are never built from raw user input inside SQL — the
-- functions below validate every identifier against a strict pattern
-- (lowercase letters, digits, underscores only) and use %I (Postgres's
-- "safe identifier" format) everywhere a name is interpolated. Values (the
-- data itself) are separate from this and were never a DDL risk.
-- ============================================================================

alter table org_custom_list_types add column if not exists table_name text;
update org_custom_list_types set table_name = 'custom_' || code where table_name is null;
alter table org_custom_list_types alter column table_name set not null;
alter table org_custom_list_types add constraint org_custom_list_types_table_name_key unique (table_name);

-- Maps a custom field's type to a real Postgres column type. Only ever
-- called with a value from this fixed list — see CUSTOM_FIELD_TYPES in
-- src/lib/organizationalStructureCustomLists.ts.
create or replace function org_dynamic_field_sql_type(p_type text)
returns text as $$
begin
  return case p_type
    when 'text' then 'text'
    when 'number' then 'numeric'
    when 'boolean' then 'boolean'
    when 'date' then 'date'
    when 'select' then 'text'
    else null
  end;
end;
$$ language plpgsql immutable;

-- Creates the physical table for a new custom list, with the same built-in
-- columns as the fixed lists (label, code, region, sort_order, is_active,
-- notes, created_at, updated_at) plus one column per entry in p_fields
-- (each { "key": ..., "type": ... }, matching CustomFieldDef).
create or replace function create_org_dynamic_list_table(
  p_table_name text,
  p_has_region boolean,
  p_fields jsonb
)
returns void as $$
declare
  field record;
  extra_cols text := '';
  field_type text;
  create_sql text;
begin
  if p_table_name !~ '^[a-z][a-z0-9_]{2,62}$' then
    raise exception 'Invalid table name: %', p_table_name;
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = p_table_name
  ) then
    raise exception 'Table already exists: %', p_table_name;
  end if;

  for field in select * from jsonb_to_recordset(coalesce(p_fields, '[]'::jsonb)) as f(key text, type text)
  loop
    if field.key !~ '^[a-z][a-z0-9_]{1,50}$' then
      raise exception 'Invalid field key: %', field.key;
    end if;
    field_type := org_dynamic_field_sql_type(field.type);
    if field_type is null then
      raise exception 'Invalid field type: %', field.type;
    end if;
    extra_cols := extra_cols || format(', %I %s', field.key, field_type);
  end loop;

  create_sql := format(
    'create table %I (
       id uuid primary key default gen_random_uuid(),
       label text not null,
       code text not null unique,
       %s
       sort_order int not null default 0,
       is_active boolean not null default true,
       notes text
       %s,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now()
     )',
    p_table_name,
    case when p_has_region then 'region text,' else '' end,
    extra_cols
  );
  execute create_sql;

  execute format(
    'create index %I on %I (is_active, sort_order)',
    p_table_name || '_active_sort_idx', p_table_name
  );

  execute format(
    'create trigger %I before update on %I for each row execute function set_updated_at()',
    p_table_name || '_set_updated_at', p_table_name
  );
end;
$$ language plpgsql;

-- Permanently drops a custom list's physical table. Only ever called when
-- an admin deletes that list from Set up — irreversible, same as any DROP
-- TABLE.
create or replace function drop_org_dynamic_list_table(p_table_name text)
returns void as $$
begin
  if p_table_name !~ '^[a-z][a-z0-9_]{2,62}$' then
    raise exception 'Invalid table name: %', p_table_name;
  end if;
  execute format('drop table if exists %I', p_table_name);
end;
$$ language plpgsql;

-- One-time migration: create a real table for every custom list that
-- already exists, then copy its rows over from the old shared table.
-- Safe to run even with zero existing custom lists — the loops just won't
-- execute.
do $$
declare
  lt record;
  item record;
  field record;
  col_names text;
  col_values text;
  val text;
begin
  for lt in select * from org_custom_list_types loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = lt.table_name
    ) then
      perform create_org_dynamic_list_table(lt.table_name, lt.has_region, lt.fields);
    end if;

    for item in select * from org_custom_list_items where list_type_id = lt.id loop
      col_names := 'label, code, sort_order, is_active, notes, created_at, updated_at';
      col_values := format(
        '%L, %L, %L, %L, %L, %L, %L',
        item.label, item.code, item.sort_order, item.is_active, item.notes,
        item.created_at, item.updated_at
      );

      if lt.has_region then
        col_names := col_names || ', region';
        col_values := col_values || format(', %L', item.region);
      end if;

      for field in select * from jsonb_to_recordset(coalesce(lt.fields, '[]'::jsonb)) as f(key text, type text)
      loop
        col_names := col_names || format(', %I', field.key);
        val := item.custom_fields ->> field.key;
        if val is null then
          col_values := col_values || ', null';
        else
          col_values := col_values || format(', %L', val);
        end if;
      end loop;

      execute format('insert into %I (%s) values (%s)', lt.table_name, col_names, col_values);
    end loop;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Once you've confirmed every custom list's data carried over correctly
-- (open each one under Set up and check), org_custom_list_items is no
-- longer used and can be dropped. Not run automatically — only do this
-- once you're sure, since it's irreversible:
--
-- drop table if exists org_custom_list_items cascade;
