-- ============================================================================
-- Remove duplicate rows from every org_map_<list> mapping table, then add
-- the unique constraint that should have stopped them from happening again.
-- Run ONCE in the Supabase SQL editor.
--
-- Safe: only ever deletes an EXACT duplicate (every mapping column on the
-- row identical to another row), always keeps one row per combination (the
-- oldest, by created_at then id), and never touches org_mapping_levels,
-- org_mapping_nodes, or any catalog table (sites, business_units, ...).
--
-- ROOT CAUSE: create_org_mapping_table() (see
-- org-structure-mapping-real-tables.sql) was meant to create every
-- org_map_<list> table with a UNIQUE constraint across its full
-- ancestor-chain + own-item columns, so the same mapping could never be
-- saved twice. That constraint is missing on at least one table in
-- production — org_map_business_units had three separate rows for the same
-- Site + Business unit combination, each with its own row id. Re-saving the
-- same checkbox in Mapping setup silently created a redundant row instead
-- of being a no-op, and downstream levels (Departments, ...) only ever got
-- linked to ONE of the duplicates — so a screen that happened to resolve a
-- different duplicate of the same Business Unit found no Departments under
-- it, even though the mapping was real. The app-side fetch (fetchAllNodes
-- in src/app/api/organizational-structure/mapping-nodes/route.ts) now
-- tolerates duplicates by always picking the same one consistently, but
-- that's a safety net, not a substitute for clean data — this script does
-- the actual cleanup and closes the gap that let it happen.
-- ============================================================================

do $outer$
declare
  lvl record;
  where_clause text;
  deleted_count integer;
begin
  for lvl in
    select table_name, mapping_columns
    from org_mapping_levels
    where table_name is not null
      and mapping_columns is not null
      and array_length(mapping_columns, 1) > 0
  loop
    where_clause := (
      select string_agg(format('a.%I = b.%I', col, col), ' and ')
      from unnest(lvl.mapping_columns) as col
    );

    execute format(
      'delete from %I a
       using %I b
       where %s
         and (a.created_at, a.id) > (b.created_at, b.id)',
      lvl.table_name,
      lvl.table_name,
      where_clause
    );

    get diagnostics deleted_count = row_count;
    if deleted_count > 0 then
      raise notice '% : removed % duplicate row(s)', lvl.table_name, deleted_count;
    end if;
  end loop;
end $outer$;

-- Now that duplicates are gone, add the missing unique constraint on every
-- table so this can't happen again. Idempotent — skips a table that
-- already has it (e.g. one created after the constraint was fixed in
-- create_org_mapping_table).
do $outer$
declare
  lvl record;
  cols text;
  constraint_name text;
begin
  for lvl in
    select table_name, mapping_columns
    from org_mapping_levels
    where table_name is not null
      and mapping_columns is not null
      and array_length(mapping_columns, 1) > 0
  loop
    cols := (
      select string_agg(quote_ident(col), ', ')
      from unnest(lvl.mapping_columns) as col
    );
    constraint_name := lvl.table_name || '_mapping_unique';

    if not exists (
      select 1 from pg_constraint where conname = constraint_name
    ) then
      execute format(
        'alter table %I add constraint %I unique (%s)',
        lvl.table_name,
        constraint_name,
        cols
      );
      raise notice '% : added unique constraint', lvl.table_name;
    end if;
  end loop;
end $outer$;

notify pgrst, 'reload schema';

-- ============================================================================
-- After running: check the NOTICEs in the SQL editor's output to see which
-- tables had duplicates removed and which got the new constraint. Reload
-- "Add posting" and Mapping setup — both should now match Skill log /
-- Appraisal templates exactly for the same Site/Business unit/... path.
-- ============================================================================
