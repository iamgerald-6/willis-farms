-- ============================================================================
-- Organizational structure — Mapping set up: real tables per mapping group
-- Run once in the Supabase SQL editor, after docs/organizational-structure/
-- mapping-groups.sql has already been run at least once (this migration
-- upgrades that feature and migrates any mappings you've already entered).
--
-- What changes: previously every mapping group (e.g. "Sections &
-- Departments") shared one table (org_structure_mappings) distinguished by
-- a group_id column. Now each group gets its own real Postgres table —
-- same pattern as sites, business_units, and the custom Set up lists —
-- named "mapping_<group id, dashes replaced with underscores>". A table
-- name built this way is always a valid, unique Postgres identifier (a
-- UUID contains only hex digits and dashes), so there's no user-input
-- validation needed the way there is for custom list names/fields.
-- org_mapping_groups stays as the registry — one row per group, now also
-- recording its table name.
-- ============================================================================

alter table org_mapping_groups add column if not exists table_name text;

-- Creates the physical junction table for one mapping group. No foreign
-- keys on parent_row_id/child_row_id — same reasoning as the old shared
-- table: the referenced list varies per group (fixed or custom), so
-- validity is enforced in the Next.js API route instead.
create or replace function create_org_dynamic_mapping_table(p_table_name text)
returns void as $$
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

  execute format(
    'create table %I (
       id uuid primary key default gen_random_uuid(),
       parent_row_id uuid not null,
       child_row_id uuid not null,
       created_at timestamptz not null default now(),
       unique (parent_row_id, child_row_id)
     )',
    p_table_name
  );

  execute format('create index %I on %I (parent_row_id)', p_table_name || '_parent_idx', p_table_name);
  execute format('create index %I on %I (child_row_id)', p_table_name || '_child_idx', p_table_name);
end;
$$ language plpgsql;

-- Permanently drops a mapping group's physical table. Only ever called
-- when an admin deletes that group from Mapping set up — irreversible,
-- same as any DROP TABLE.
create or replace function drop_org_dynamic_mapping_table(p_table_name text)
returns void as $$
begin
  if p_table_name !~ '^[a-z][a-z0-9_]{2,62}$' then
    raise exception 'Invalid table name: %', p_table_name;
  end if;
  execute format('drop table if exists %I', p_table_name);
end;
$$ language plpgsql;

-- One-time migration: give every existing mapping group its own table and
-- copy its rows over from the old shared table. Safe to run even with no
-- existing groups.
do $$
declare
  grp record;
  tbl text;
begin
  for grp in select * from org_mapping_groups loop
    tbl := coalesce(grp.table_name, 'mapping_' || replace(grp.id::text, '-', '_'));

    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      perform create_org_dynamic_mapping_table(tbl);
    end if;

    if grp.table_name is null then
      update org_mapping_groups set table_name = tbl where id = grp.id;
    end if;

    execute format(
      'insert into %I (parent_row_id, child_row_id, created_at)
       select parent_row_id, child_row_id, created_at
       from org_structure_mappings where group_id = %L
       on conflict (parent_row_id, child_row_id) do nothing',
      tbl, grp.id
    );
  end loop;
end $$;

alter table org_mapping_groups alter column table_name set not null;
alter table org_mapping_groups add constraint org_mapping_groups_table_name_key unique (table_name);

notify pgrst, 'reload schema';

-- Once you've confirmed every mapping group's data carried over correctly
-- (open each one under Mapping set up and check), org_structure_mappings
-- is no longer used and can be dropped. Not run automatically — only do
-- this once you're sure, since it's irreversible:
--
-- drop table if exists org_structure_mappings cascade;
