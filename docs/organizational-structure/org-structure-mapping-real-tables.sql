-- ============================================================================
-- Org structure mapping set up — real per-level tables with real FK columns
-- Run once in the Supabase SQL editor, after org-structure-mapping-tree.sql.
-- This migrates your existing mappings into the new tables automatically —
-- nothing already mapped is lost, but it's worth spot-checking a few
-- mappings under Org structure mapping set up afterward regardless.
--
-- Previously every mapping (whichever combination of lists an admin chose
-- to link) lived in two generic, shared tables: org_mapping_levels (which
-- lists participate, and their parent/child shape) and org_mapping_nodes
-- (one opaque row per valid combination, chained via parent_node_id). That
-- scaled to any shape without new tables, but there was no real table you
-- could point at and say "this is the Site/Business unit/Department
-- mapping" — everything sat in one shared, generically-shaped table.
--
-- This adds a real physical table for every level that has a parent —
-- named after that level's own list (e.g. mapping Business unit under Site
-- creates org_map_business_units), with one real foreign key column per
-- level in its chain, root to self — e.g. org_map_departments has
-- site_id, business_unit_id, and department_id, each a real FK to
-- sites/business_units/departments. A level with no parent (a root, e.g.
-- Site itself) never gets one of these — nothing to constrain it against,
-- exactly like today.
--
-- org_mapping_levels stays as the registry (one row per participating
-- list), now also recording its own table name and column list. A root
-- level's own checkbox mappings (only relevant if you deliberately toggle
-- items at the very top of a chain — rare) keep using org_mapping_nodes,
-- since there's no ancestor combination to build real columns from.
-- org_mapping_nodes is otherwise no longer written to going forward — kept
-- around (not dropped) as the source this migration reads existing
-- mappings from, and as a safety net until you're confident everything
-- carried over.
--
-- Column/table names are never built from raw user input inside SQL — the
-- functions below validate every identifier the same way
-- create_org_dynamic_list_table already does, and use %I everywhere a name
-- is interpolated.
-- ============================================================================

alter table org_mapping_levels add column if not exists table_name text;
alter table org_mapping_levels add column if not exists mapping_columns text[];

-- A level's full ancestor chain, root first, ending with itself — e.g. for
-- Department (under Business unit, under Site): Site, Business unit,
-- Department, each row naming the real FK column and referenced table
-- that level needs. Used both by the one-time migration below and by the
-- app every time a level is added or reparented.
create or replace function org_mapping_level_chain(p_level_id uuid)
returns table(seq int, level_id uuid, column_name text, ref_table text) as $$
  with recursive chain as (
    select l.id, l.parent_level_id, 0 as depth
    from org_mapping_levels l
    where l.id = p_level_id
    union all
    select p.id, p.parent_level_id, c.depth + 1
    from org_mapping_levels p
    join chain c on p.id = c.parent_level_id
  )
  select
    row_number() over (order by c.depth desc) as seq,
    c.id as level_id,
    lt.job_posting_column as column_name,
    lt.table_name as ref_table
  from chain c
  join org_mapping_levels ml on ml.id = c.id
  join org_custom_list_types lt on lt.id = ml.list_type_id
  order by seq;
$$ language sql stable;

-- A mapping node's full ancestor chain (old shared-table model) — one
-- (level_id, item_id) pair per level from itself up to the root. Only used
-- by the one-time migration below, to carry existing org_mapping_nodes
-- rows over into each level's new real table.
create or replace function org_mapping_node_chain(p_node_id uuid)
returns table(level_id uuid, item_id uuid) as $$
  with recursive chain as (
    select n.id, n.level_id, n.item_id, n.parent_node_id
    from org_mapping_nodes n
    where n.id = p_node_id
    union all
    select p.id, p.level_id, p.item_id, p.parent_node_id
    from org_mapping_nodes p
    join chain c on p.id = c.parent_node_id
  )
  select chain.level_id, chain.item_id from chain;
$$ language sql stable;

-- Creates the physical table for one non-root mapping level. p_columns is
-- a JSON array of { "column_name": "site_id", "ref_table": "sites" }, in
-- order from the root of the chain down to (and including) this level's
-- own column.
create or replace function create_org_mapping_table(
  p_table_name text,
  p_columns jsonb
)
returns void as $$
declare
  col record;
  col_defs text := '';
  col_names text := '';
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

    col_defs := col_defs || format(
      '%I uuid not null references %I(id) on delete cascade, ',
      col.column_name, col.ref_table
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

-- Permanently drops one level's physical mapping table — called whenever a
-- level is removed from the chain, and whenever it (or an ancestor above
-- it) is reparented, since that changes which columns the table needs.
-- Irreversible, same as any DROP TABLE.
create or replace function drop_org_mapping_table(p_table_name text)
returns void as $$
begin
  if p_table_name !~ '^[a-z][a-z0-9_]{2,62}$' then
    raise exception 'Invalid table name: %', p_table_name;
  end if;
  execute format('drop table if exists %I', p_table_name);
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================================
-- One-time migration: give every existing non-root level its own real
-- table, and carry its existing org_mapping_nodes rows over into it.
-- Safe to run even with zero existing levels/mappings.
-- ============================================================================
do $$
declare
  lvl record;
  chain_cols jsonb;
  chain_names text[];
  tbl text;
  node record;
  chain_row record;
  item_map jsonb;
  col_names text;
  col_values text;
  val text;
begin
  for lvl in
    select l.id, l.list_type_id
    from org_mapping_levels l
    where l.parent_level_id is not null
      and l.table_name is null
  loop
    select
      jsonb_agg(jsonb_build_object('column_name', column_name, 'ref_table', ref_table) order by seq),
      array_agg(column_name order by seq)
    into chain_cols, chain_names
    from org_mapping_level_chain(lvl.id);

    select 'org_map_' || table_name into tbl
    from org_custom_list_types where id = lvl.list_type_id;

    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      perform create_org_mapping_table(tbl, chain_cols);
    end if;

    update org_mapping_levels set table_name = tbl, mapping_columns = chain_names where id = lvl.id;

    for node in select * from org_mapping_nodes where level_id = lvl.id loop
      select jsonb_object_agg(level_id::text, item_id::text) into item_map
      from org_mapping_node_chain(node.id);

      -- Walk this level's own chain (root..self) and pull each ancestor's
      -- item id out of the node's resolved chain by level_id, so a value
      -- always lands under the right column even if two unrelated levels
      -- happen to share a list (and therefore a column name).
      col_names := '';
      col_values := '';
      for chain_row in
        select cc.seq, cc.level_id, cc.column_name
        from org_mapping_level_chain(lvl.id) cc
      loop
        val := item_map ->> chain_row.level_id::text;
        if val is null then
          raise notice 'Skipping incomplete mapping node % on level % — missing an ancestor value.', node.id, lvl.id;
          col_names := null;
          exit;
        end if;
        col_names := coalesce(col_names, '') || format('%I, ', chain_row.column_name);
        col_values := coalesce(col_values, '') || format('%L, ', val);
      end loop;

      if col_names is not null and col_names <> '' then
        execute format(
          'insert into %I (%s) values (%s) on conflict do nothing',
          tbl,
          left(col_names, length(col_names) - 2),
          left(col_values, length(col_values) - 2)
        );
      end if;
    end loop;
  end loop;
end $$;

notify pgrst, 'reload schema';
