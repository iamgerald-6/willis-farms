-- ============================================================================
-- Backfill users.user_role_id from the old users.role column.
--
-- Why this is needed: access control was just switched to read ONLY the new
-- "User role" list (users.user_role_id) — the old employee/manager/admin/
-- super_admin column is no longer consulted at all, and anyone without a
-- resolved User role now defaults to "Standard Role" (baseline access, no
-- User Management / System Definitions / appraisal-admin breadth). Nobody's
-- existing account was ever migrated onto the new list, so every admin/
-- manager/super_admin account lost its elevated access the moment the code
-- shipped — this is why you were suddenly locked out of pages you used to
-- see.
--
-- This script is a one-time, best-effort mapping from the old role to the
-- closest new role, so no one is locked out while you go back and assign
-- the exact right role to each person from Access Control:
--
--   old "employee"     -> "Standard Role"
--   old "manager"       -> "Executive Role"        (full role access, same breadth manager had)
--   old "admin"         -> "System Administrator"  (System Definitions + User Management)
--   old "super_admin"   -> "Super Admin"            (bypasses everything)
--
-- Run this in the Supabase SQL editor. It only touches rows where
-- user_role_id is currently NULL — anyone already assigned a User role is
-- left alone.
-- ============================================================================

do $$
declare
  v_table_name text;
  v_standard_id uuid;
  v_executive_id uuid;
  v_sysadmin_id uuid;
  v_superadmin_id uuid;
  v_missing text := '';
begin
  select table_name into v_table_name
  from org_custom_list_types
  where lower(trim(coalesce(singular, label))) = lower('User role')
     or lower(trim(label)) = lower('User role')
  limit 1;

  if v_table_name is null then
    raise exception
      'No "User role" list found in org_custom_list_types. Create it first under System Definitions > Organizational structure > Add new list (with the 7 roles as items), then re-run this script.';
  end if;

  execute format('select id from %I where lower(trim(label)) = lower(%L) limit 1', v_table_name, 'Standard Role') into v_standard_id;
  execute format('select id from %I where lower(trim(label)) = lower(%L) limit 1', v_table_name, 'Executive Role') into v_executive_id;
  execute format('select id from %I where lower(trim(label)) = lower(%L) limit 1', v_table_name, 'System Administrator') into v_sysadmin_id;
  execute format('select id from %I where lower(trim(label)) = lower(%L) limit 1', v_table_name, 'Super Admin') into v_superadmin_id;

  if v_standard_id is null then v_missing := v_missing || 'Standard Role, '; end if;
  if v_executive_id is null then v_missing := v_missing || 'Executive Role, '; end if;
  if v_sysadmin_id is null then v_missing := v_missing || 'System Administrator, '; end if;
  if v_superadmin_id is null then v_missing := v_missing || 'Super Admin, '; end if;

  if v_missing <> '' then
    raise exception
      'The "User role" list (table %) is missing these exact items: %. Add them (exact label text matters) then re-run.',
      v_table_name, rtrim(v_missing, ', ');
  end if;

  update users set user_role_id = v_standard_id where role = 'employee' and user_role_id is null;
  update users set user_role_id = v_executive_id where role = 'manager' and user_role_id is null;
  update users set user_role_id = v_sysadmin_id where role = 'admin' and user_role_id is null;
  update users set user_role_id = v_superadmin_id where role = 'super_admin' and user_role_id is null;

  raise notice 'Backfill complete against table %.', v_table_name;
end $$;

notify pgrst, 'reload schema';

-- Sanity check afterwards:
-- select email, role as old_role, user_role_id from users order by email;
