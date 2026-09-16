-- ============================================================================
-- Add an enforced foreign key on appraisals.employee_user_id -> users(user_id)
-- Run ONCE in the Supabase SQL editor.
--
-- WHY: appraisals.employee_user_id already holds the right value (the
-- employee's real users.user_id, set at appraisal-creation time — see
-- src/app/api/appraisal/upload_appraisal/route.ts) and is already used
-- throughout the appraisal module's access control (src/lib/appraisalAccess.ts,
-- src/app/api/appraisal/[id]/route.ts, etc.). But nothing in the schema
-- enforces that relationship — there is no FK constraint tying it to
-- users(user_id), only application code that happens to populate it
-- correctly. This adds that constraint so the database itself guarantees
-- it, instead of only application code convention.
--
-- SAFETY: adding a FK constraint fails outright if even one existing row
-- has a value that doesn't match any users.user_id. This script checks
-- for that first and only adds the constraint if every non-null
-- employee_user_id value is valid — if any orphaned rows exist, it skips
-- the ALTER and reports the count instead of failing, so you can review
-- those specific rows before deciding how to handle them (null them out,
-- fix the value, etc.) and re-run this script afterward.
--
-- Idempotent: safe to re-run — does nothing if the constraint already exists.
--
-- TYPE NOTE: users.user_id is character varying (confirmed live — see the
-- promotions.user_id migration in the same session), while
-- appraisals.employee_user_id turned out to be uuid. A foreign key needs
-- both sides to actually be the same type, not just comparable via a cast
-- — so this script converts employee_user_id to character varying first
-- (the values themselves don't change, only the column's declared type)
-- before attempting the orphan check or the ALTER.
-- ============================================================================

do $$
declare
  orphan_count int;
  current_type text;
begin
  if exists (
    select 1 from pg_constraint where conname = 'appraisals_employee_user_id_fkey'
  ) then
    raise notice 'appraisals_employee_user_id_fkey already exists — nothing to do.';
    return;
  end if;

  select data_type into current_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'appraisals' and column_name = 'employee_user_id';

  if current_type not in ('character varying', 'text') then
    raise notice 'appraisals.employee_user_id is currently %, converting to character varying to match users.user_id.', current_type;
    alter table appraisals
      alter column employee_user_id type character varying using employee_user_id::text;
  end if;

  select count(*) into orphan_count
  from appraisals a
  where a.employee_user_id is not null
    and not exists (select 1 from users u where u.user_id = a.employee_user_id);

  if orphan_count > 0 then
    raise notice 'appraisals: % row(s) have an employee_user_id that does not match any users.user_id — skipping FK constraint addition. Review these rows first: select id, employee_user_id, employee_name, company_id, review_quarter, review_year from appraisals where employee_user_id is not null and employee_user_id not in (select user_id from users). Re-run this script once resolved.', orphan_count;
  else
    alter table appraisals
      add constraint appraisals_employee_user_id_fkey
      foreign key (employee_user_id) references users(user_id);
    raise notice 'appraisals: employee_user_id foreign key constraint added successfully.';
  end if;
end $$;

notify pgrst, 'reload schema';
