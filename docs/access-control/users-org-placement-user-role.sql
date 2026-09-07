-- ============================================================================
-- Employee org placement — "User role", a custom org-structure list created
-- via System Definitions > Organizational structure > Add new list. Same
-- pattern as users-org-placement.sql's 6 fixed fields (Site / Business unit /
-- Department / Section / Position / Grade level): the value already lives on
-- job_postings.user_role_id (added automatically when the list was created —
-- see src/app/api/organizational-structure/custom-list-types/route.ts), and
-- this adds the matching column on users so it can be copied over at hire
-- time (see resolveEmployeeOrgPlacement.ts) and edited afterward from the
-- employee's profile (Access Control > Org placement).
--
-- The list's physical table name depends on how/when it was created (e.g.
-- "custom_user_role"), so it's looked up dynamically by label below instead
-- of hardcoded.
-- ============================================================================

do $$
declare
  v_table_name text;
begin
  select table_name into v_table_name
  from org_custom_list_types
  where lower(trim(coalesce(singular, label))) = lower('User role')
     or lower(trim(label)) = lower('User role')
  limit 1;

  if v_table_name is null then
    raise exception
      'No "User role" list found in org_custom_list_types. Create it first under System Definitions > Organizational structure > Add new list, then re-run this script.';
  end if;

  execute format(
    'alter table users add column if not exists user_role_id uuid references %I(id) on delete set null',
    v_table_name
  );
end $$;

notify pgrst, 'reload schema';
