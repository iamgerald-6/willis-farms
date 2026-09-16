-- ============================================================================
-- Fix: org structure mapping assumed every list uses uuid ids
-- Run ONCE in the Supabase SQL editor. Safe to run even if you've never
-- successfully mapped anything under Site — this only widens column types,
-- it never narrows or drops data.
--
-- ROOT CAUSE: every org-structure list except Site is a dynamically-created
-- custom_<slug> table with a uuid primary key. `sites` is the one
-- exception — a real, hand-built table with an `integer` primary key (see
-- docs/current_database_schema.sql, "sites"). The org-structure-mapping
-- system (docs/organizational-structure/org-structure-mapping-real-tables.sql)
-- was written assuming uuid everywhere and hardcodes that type in two
-- places:
--   1. org_mapping_nodes.item_id (uuid) — used for a ROOT level's own
--      checkbox state (e.g. "which sites are included in the map"). Site is
--      a root level, so ticking a site box tries to insert its integer id
--      ("107") into a uuid column — that's the exact error you hit.
--   2. create_org_mapping_table(), the function that builds a real physical
--      table (org_map_business_units, org_map_departments, ...) the first
--      time a level under Site is configured — it hardcodes every ancestor
--      column, including site_id, as uuid too. That would break the same
--      way one layer down, the moment anything is mapped under Site.
-- ============================================================================

-- Fix 1: widen item_id so a root level's checkbox state can hold either a
-- uuid (every other root-eligible list) or an integer-as-text (Site) —
-- compared only as an opaque string throughout the app (see
-- src/app/api/organizational-structure/mapping-nodes/route.ts), so this is
-- safe with no app-code changes required.
alter table org_mapping_nodes alter column item_id type text;

-- Fix 2: make table creation look up each referenced list's REAL id column
-- type instead of assuming uuid, so a table chained under Site gets an
-- integer site_id (with a working FK to sites(id)) while every other
-- ancestor column still gets uuid, exactly as before.
create or replace function create_org_mapping_table(
  p_table_name text,
  p_columns jsonb
)
returns void as $$
declare
  col record;
  col_defs text := '';
  col_names text := '';
  id_type text;
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
  if jsonb_array_length(coalesce(p_columns, '[]'::jsonb)) = 0 then
    raise exception 'A mapping table needs at least one column';
  end if;

  for col in
    select * from jsonb_to_recordset(p_columns) as c(column_name text, ref_table text)
  loop
    if col.column_name !~ '^[a-z][a-z0-9_]{2,50}$' then
      raise exception 'Invalid column name: %', col.column_name;
    end if;
    if col.ref_table !~ '^[a-z][a-z0-9_]{2,62}$' then
      raise exception 'Invalid referenced table: %', col.ref_table;
    end if;
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = col.ref_table
    ) then
      raise exception 'Referenced table does not exist: %', col.ref_table;
    end if;

    select data_type into id_type
    from information_schema.columns
    where table_schema = 'public' and table_name = col.ref_table and column_name = 'id';
    if id_type is null then
      raise exception 'Could not determine id column type for table: %', col.ref_table;
    end if;

    col_defs := col_defs || format(
      '%I %s not null references %I(id) on delete cascade, ',
      col.column_name,
      case when id_type = 'uuid' then 'uuid' else 'integer' end,
      col.ref_table
    );
    col_names := col_names || format('%I, ', col.column_name);
  end loop;

  execute format(
    'create table %I (
       id uuid primary key default gen_random_uuid(),
       %s
       created_at timestamptz not null default now(),
       unique (%s)
     )',
    p_table_name,
    col_defs,
    left(col_names, length(col_names) - 2)
  );
end;
$$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';

-- ============================================================================
-- After running: try ticking a Site checkbox again — it should save. If you
-- get a DIFFERENT error when mapping something under Site (e.g. Business
-- unit), it likely means a table like org_map_business_units already exists
-- from before this fix, with the old broken uuid site_id column — run this
-- check and tell me what it returns, and I'll write a targeted fix for that
-- specific table:
--
--   select table_name, column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name like 'org_map_%' and column_name = 'site_id';
-- ============================================================================
