-- ============================================================================
-- Organizational structure -> Job postings: real foreign key columns
-- Run once in the Supabase SQL editor, AFTER
-- docs/organizational-structure/drop-mapping-tables.sql.
--
-- Every org-structure list (Sites, Business units, Departments / divisions,
-- Sections, Grade levels, and any custom list — Position, Age, Salary,
-- etc.) gets its own real foreign key column on job_postings, pointing at
-- that list's own physical table's primary key. This is a genuine
-- normalized relationship — Postgres enforces that a posting can only
-- reference a row that actually exists in the relevant list, and knows
-- what to do if that row is later deleted (see ON DELETE SET NULL below).
--
-- Because admins can add or remove lists at any time from Set up, the
-- number of these columns isn't fixed. Two RPC functions
-- (add_job_posting_org_column / drop_job_posting_org_column) let the app
-- add or remove one column at a time, called automatically whenever a
-- list type is created or deleted (see the updated custom-list-types API
-- routes). This migration:
--   1. Adds a `job_posting_column` text column to org_custom_list_types,
--      recording which column on job_postings belongs to each list (so
--      the app never has to re-derive/guess the name).
--   2. Defines the two RPC functions, SECURITY DEFINER like the other
--      dynamic-DDL functions in this feature (needed for the same
--      ownership reason as fix-dynamic-table-ownership.sql).
--   3. Backfills the 8 lists that exist today with their own column.
--
-- ON DELETE behavior: SET NULL. Deleting a list item (e.g. one specific
-- Site) clears that field on any posting that referenced it, rather than
-- blocking the deletion or deleting the posting. Deleting an entire LIST
-- (not just one item) still goes through the app's own DELETE flow, which
-- now drops the job_postings column first (see custom-list-types
-- [id]/route.ts) — so there's no dangling column left pointing at a
-- table that no longer exists.
-- ============================================================================

alter table org_custom_list_types
  add column if not exists job_posting_column text;

-- Adds one real FK column to job_postings for a list type. p_referenced_table
-- must be an existing table (the list's own physical table); the column is
-- validated the same way every other dynamically-named identifier in this
-- feature is, to rule out SQL injection via a crafted table/column name.
create or replace function add_job_posting_org_column(
  p_column_name text,
  p_referenced_table text
)
returns void as $$
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

  execute format(
    'alter table job_postings add column if not exists %I uuid references %I(id) on delete set null',
    p_column_name, p_referenced_table
  );
  execute format(
    'create index if not exists %I on job_postings (%I)',
    'job_postings_' || p_column_name || '_idx', p_column_name
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Drops one job_postings column, e.g. when its list type is deleted.
create or replace function drop_job_posting_org_column(
  p_column_name text
)
returns void as $$
begin
  if p_column_name !~ '^[a-z][a-z0-9_]{2,50}$' then
    raise exception 'Invalid column name: %', p_column_name;
  end if;

  execute format('alter table job_postings drop column if exists %I', p_column_name);
end;
$$ language plpgsql security definer set search_path = public;

-- Backfill: give each of the 8 lists that exist today its own column.
select add_job_posting_org_column('position_id', 'custom_position');
select add_job_posting_org_column('site_id', 'sites');
select add_job_posting_org_column('business_unit_id', 'business_units');
select add_job_posting_org_column('age_id', 'custom_age');
select add_job_posting_org_column('salary_id', 'custom_salary');
select add_job_posting_org_column('department_id', 'departments');
select add_job_posting_org_column('section_id', 'sections');
select add_job_posting_org_column('grade_level_id', 'grade_levels');

update org_custom_list_types set job_posting_column = 'position_id' where table_name = 'custom_position';
update org_custom_list_types set job_posting_column = 'site_id' where table_name = 'sites';
update org_custom_list_types set job_posting_column = 'business_unit_id' where table_name = 'business_units';
update org_custom_list_types set job_posting_column = 'age_id' where table_name = 'custom_age';
update org_custom_list_types set job_posting_column = 'salary_id' where table_name = 'custom_salary';
update org_custom_list_types set job_posting_column = 'department_id' where table_name = 'departments';
update org_custom_list_types set job_posting_column = 'section_id' where table_name = 'sections';
update org_custom_list_types set job_posting_column = 'grade_level_id' where table_name = 'grade_levels';

notify pgrst, 'reload schema';
