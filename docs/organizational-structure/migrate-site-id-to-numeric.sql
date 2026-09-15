-- ============================================================================
-- Migrate sites.id from uuid to a plain sequential number (1, 2, 3, ...)
-- Run ONCE in the Supabase SQL editor. Read the whole file before running it.
--
-- WHY / SCOPE: sites.id is currently `uuid primary key default
-- gen_random_uuid()`. This migration changes it to `integer` (via a
-- sequence, so new sites keep auto-numbering after this runs).
--
-- IMPORTANT — everything that has to happen as one unit (STEP 1 below) is
-- wrapped in a single `do $$ ... $$;` block rather than a plain
-- begin/commit script. Some SQL runners execute a pasted script statement
-- by statement, each auto-committing on its own — that broke an earlier
-- version of this migration (a temporary table vanished the instant it was
-- created, before the very next line could use it, because "on commit
-- drop" fired right after that one statement's own implicit commit). A
-- `do $$ ... $$;` block is a single SQL statement no matter how the
-- surrounding script gets split, so this can't happen again.
--
-- HOW DEPENDENT TABLES ARE FOUND: rather than naming tables by hand (which
-- missed a leftover legacy table — org_site_business_units — that the docs
-- said was dropped but is apparently still present), this asks Postgres
-- directly: "find every single-column foreign key anywhere in the database
-- that points at sites(id)". Whatever it finds — the tables the app
-- actively uses (appraisal_grade_templates, skill_log_templates, users,
-- job_postings, every org_map_<list> table) and any old/unused leftover
-- table still sitting there — gets repointed the same way, preserving each
-- one's own not-null-ness and its own ON DELETE behavior (cascade / set
-- null / restrict / set default), whatever that already was.
--
-- NOT touched, on purpose: org_mapping_nodes.item_id — legacy/historical
-- table, still used for root-level (no-parent) checkbox mappings, item_id
-- has no FK constraint at all and holds ids from many different lists, not
-- just Site, so it isn't something this kind of table-driven migration can
-- safely touch. Any old Site references left in there keep their
-- pre-migration uuid values.
--
-- HOW NUMBERING IS ASSIGNED: existing sites are numbered 101, 102, 103, ...
-- in sort_order, created_at order (i.e. however they already sort in the
-- admin UI today) — not in random uuid order. Starting at 101 rather than
-- 1 means every id is a real three-digit number from day one, with no
-- leading-zero padding needed (this is a true integer column — "001" can't
-- be stored as a number, but 101/102/103 reads the same way). If you'd
-- rather a specific site be #101 regardless of its current sort_order,
-- reorder them in the Sites admin screen BEFORE running this.
--
-- SAFETY: take a fresh Supabase backup / confirm PITR is available before
-- running this against production data. Dropping the old uuid columns is
-- the one truly irreversible part. If STEP 1 fails partway for any reason,
-- Postgres rolls the whole `do` block back automatically — it's one
-- statement, so there's no partial state to clean up.
-- ============================================================================

-- ── STEP 1: everything that touches sites and its dependents, as one
-- single atomic statement. ───────────────────────────────────────────────
do $$
declare
  rec record;
  is_notnull boolean;
  action_sql text;
begin
  -- Give sites itself the new numeric id, numbered by current admin sort
  -- order (not random uuid order).
  alter table sites add column if not exists id_numeric int;

  -- Starts at 101 (not 1) so every site gets a real three-digit number —
  -- 101, 102, 103, ... — right from the first one, no leading-zero padding
  -- needed (this is a true integer column; "001" can't be stored as a
  -- number, but 101/102/103 reads the same way and never needs padding
  -- until you pass 999 sites).
  update sites
  set id_numeric = sub.rn
  from (
    select id, 100 + row_number() over (order by sort_order, created_at) as rn
    from sites
  ) sub
  where sub.id = sites.id;

  alter table sites alter column id_numeric set not null;

  -- Scratch space to remember what to rebuild after sites' primary key
  -- changes below — a temp table is safe here because it's created and
  -- used entirely within this one statement/transaction, never depended
  -- on across a statement boundary the way the earlier version was.
  create temporary table _site_fk_rebuild (
    table_name text,
    column_name text,
    delete_action text
  );

  -- Find and repoint EVERY table with a foreign key to sites(id), whatever
  -- it's called — this is what makes the migration resilient to tables the
  -- docs/app code don't know about (e.g. old unused ones still physically
  -- present in the database).
  for rec in
    select
      con.conname,
      rel.relname as table_name,
      att.attname as column_name,
      con.confdeltype as delete_action
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_class frel on frel.oid = con.confrelid
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and frel.relname = 'sites'
      and array_length(con.conkey, 1) = 1
  loop
    select attnotnull into is_notnull
    from pg_attribute
    where attrelid = rec.table_name::regclass and attname = rec.column_name;

    action_sql := case rec.delete_action
      when 'c' then 'on delete cascade'
      when 'n' then 'on delete set null'
      when 'r' then 'on delete restrict'
      when 'd' then 'on delete set default'
      else ''
    end;

    execute format('alter table %I drop constraint %I', rec.table_name, rec.conname);
    execute format('alter table %I add column %I int', rec.table_name, rec.column_name || '_numeric');
    execute format(
      'update %I t set %I = s.id_numeric from sites s where s.id = t.%I',
      rec.table_name, rec.column_name || '_numeric', rec.column_name
    );
    if is_notnull then
      execute format(
        'alter table %I alter column %I set not null',
        rec.table_name, rec.column_name || '_numeric'
      );
    end if;
    execute format('alter table %I drop column %I', rec.table_name, rec.column_name);
    execute format(
      'alter table %I rename column %I to %I',
      rec.table_name, rec.column_name || '_numeric', rec.column_name
    );

    insert into _site_fk_rebuild (table_name, column_name, delete_action)
    values (rec.table_name, rec.column_name, action_sql);

    raise notice 'Repointed %.% to numeric (%)', rec.table_name, rec.column_name,
      case when is_notnull then 'not null' else 'nullable' end;
  end loop;

  -- Promote sites.id_numeric to be the real primary key — safe now, every
  -- dependent FK found above has already been dropped.
  alter table sites drop constraint if exists sites_pkey;
  alter table sites drop column id;
  alter table sites rename column id_numeric to id;

  -- Auto-numbering for future inserts, continuing after the highest number
  -- just assigned — matches how gen_random_uuid() used to auto-fill new rows.
  create sequence if not exists sites_id_seq owned by sites.id;
  perform setval('sites_id_seq', (select coalesce(max(id), 0) from sites));
  alter table sites alter column id set default nextval('sites_id_seq');
  alter table sites add primary key (id);

  -- Re-add every FK constraint dropped above, now pointing at the new
  -- integer primary key, with each table's own original ON DELETE behavior
  -- restored exactly.
  for rec in select * from _site_fk_rebuild loop
    execute format(
      'alter table %I add constraint %I foreign key (%I) references sites(id) %s',
      rec.table_name,
      rec.table_name || '_' || rec.column_name || '_fkey',
      rec.column_name,
      rec.delete_action
    );
  end loop;

  drop table _site_fk_rebuild;
end $$;

-- ── STEP 2: keep the two dynamic-DDL generator functions correct for the
-- future — both currently hardcode `uuid` for every FK column they create,
-- which would silently create a mismatched uuid column pointing at sites'
-- now-integer id the next time a Site-rooted mapping level or job-posting
-- column is added. Switch both to read the referenced table's actual id
-- column type at creation time instead of assuming uuid — correct for
-- sites now, and safe for every other still-uuid list table too. These are
-- self-contained, idempotent CREATE OR REPLACE statements — safe to run
-- even as their own separate statements regardless of how your SQL runner
-- splits the script. ─────────────────────────────────────────────────────

-- from org-structure-mapping-real-tables.sql
create or replace function create_org_mapping_table(
  p_table_name text,
  p_columns jsonb
)
returns void as $func$
declare
  col record;
  col_defs text := '';
  col_names text := '';
  ref_id_type text;
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

    select data_type into ref_id_type
    from information_schema.columns
    where table_schema = 'public' and table_name = col.ref_table and column_name = 'id';

    col_defs := col_defs || format(
      '%I %s not null references %I(id) on delete cascade, ',
      col.column_name, coalesce(ref_id_type, 'uuid'), col.ref_table
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
$func$ language plpgsql security definer set search_path = public;

-- from job-postings-org-fields.sql
create or replace function add_job_posting_org_column(
  p_column_name text,
  p_referenced_table text
)
returns void as $func$
declare
  ref_id_type text;
begin
  if p_column_name !~ '^[a-z][a-z0-9_]{2,50}$' then
    raise exception 'Invalid column name: %', p_column_name;
  end if;
  if p_referenced_table !~ '^[a-z][a-z0-9_]{2,62}$' then
    raise exception 'Invalid referenced table: %', p_referenced_table;
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = p_referenced_table
  ) then
    raise exception 'Referenced table does not exist: %', p_referenced_table;
  end if;

  select data_type into ref_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = p_referenced_table and column_name = 'id';

  execute format(
    'alter table job_postings add column if not exists %I %s references %I(id) on delete set null',
    p_column_name, coalesce(ref_id_type, 'uuid'), p_referenced_table
  );
  execute format(
    'create index if not exists %I on job_postings (%I)',
    'job_postings_' || p_column_name || '_idx', p_column_name
  );
end;
$func$ language plpgsql security definer set search_path = public;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER RUNNING: spot-check a few things before trusting it —
--   select id, label, code from sites order by id;
--   select id, site_id from users where site_id is not null limit 5;
--   select id, site_id from appraisal_grade_templates limit 5;
--   select conname, conrelid::regclass from pg_constraint
--     where confrelid = 'sites'::regclass;  -- lists every FK that now
--                                            -- points at the new integer id
-- and open Set up / Org structure mapping, Appraisal -> Manage appraisals,
-- Skill Log templates, and Job postings in the app to confirm each still
-- shows the right Site for existing records.
-- ============================================================================
