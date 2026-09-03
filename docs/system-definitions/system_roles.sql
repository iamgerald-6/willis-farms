-- ============================================================================
-- System roles — extensible role catalog + scoped user grants (step 4)
-- Run once in the Supabase SQL editor AFTER:
--   1. docs/system-definitions/org_structure.sql
--   2. docs/system-definitions/pay_grades.sql
--   3. docs/system-definitions/positions_pay_and_users.sql
--
-- Decouples software permissions from job title and pay grade:
--   • system_role_definitions — catalog (SYSTEM_ADMIN, HR_MANAGER, …)
--   • user_system_roles       — who holds which role, and org scope
--
-- Works alongside (does not replace) users.page_permission_actions — module
-- CRUD checkboxes stay; these roles supply organisational scope gates.
--
-- users.role (employee/admin/manager) is NOT dropped — kept until app code
-- migrates to resolveEffectiveCapabilities() reading user_system_roles.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Patch: executive pay-grade ranks (E always above any L grade)
--    L grades use ranks 1, 2, 3…  E1/E2 use fixed high band 1001/1002 so
--    adding L8+ never requires renumbering executives. Safe to re-run.
-- ---------------------------------------------------------------------------
update pay_grades
set rank = 1001, sort_order = 1001
where id = 'E1';

update pay_grades
set rank = 1002, sort_order = 1002
where id = 'E2';

create or replace function enforce_pay_grade_rank_band()
returns trigger as $$
begin
  if new.grade_type = 'standard' and new.rank >= 1000 then
    raise exception 'standard grades must have rank below 1000 (got %)', new.rank;
  end if;
  if new.grade_type = 'executive' and new.rank < 1000 then
    raise exception 'executive grades must have rank >= 1000 (got %)', new.rank;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists pay_grades_rank_band_check on pay_grades;
create trigger pay_grades_rank_band_check
  before insert or update on pay_grades
  for each row execute function enforce_pay_grade_rank_band();

-- ---------------------------------------------------------------------------
-- 1. Role catalog — extensible without deploys
-- ---------------------------------------------------------------------------
create table if not exists system_role_definitions (
  role_key text primary key,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists system_role_definitions_set_updated_at on system_role_definitions;
create trigger system_role_definitions_set_updated_at
  before update on system_role_definitions
  for each row execute function set_updated_at();

insert into system_role_definitions (role_key, label, description, sort_order)
values
  (
    'SYSTEM_ADMIN',
    'System Administrator',
    'Full platform administration across all modules and org scopes.',
    1
  ),
  (
    'HR_MANAGER',
    'HR Manager',
    'Human-capital operations within the assigned organisational scope.',
    2
  ),
  (
    'SUPERVISOR',
    'Supervisor',
    'Line supervision and team workflows within the assigned scope.',
    3
  ),
  (
    'STANDARD_EMPLOYEE',
    'Standard Employee',
    'Default employee access — typically scoped to self.',
    4
  )
on conflict (role_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. User role grants with organisational scope
--    scope_type:
--      GLOBAL         — entire enterprise
--      BUSINESS_UNIT  — one business unit
--      SITE           — one site
--      DEPARTMENT     — one department
--      SELF           — the user only (no org FK)
--
--    If a prior run failed on FK types, drop the broken table first:
--      drop table if exists user_system_roles cascade;
-- ---------------------------------------------------------------------------
create table if not exists user_system_roles (
  id uuid primary key default gen_random_uuid(),
  -- public.users.user_id is varchar/text in this project (Supabase auth id string)
  user_id text not null references public.users(user_id) on delete cascade,
  role_key text not null references system_role_definitions(role_key) on delete restrict,
  scope_type text not null check (
    scope_type in ('GLOBAL', 'BUSINESS_UNIT', 'SITE', 'DEPARTMENT', 'SELF')
  ),
  scope_business_unit_id text references business_units(id) on delete restrict,
  scope_site_id text references sites(id) on delete restrict,
  scope_department_id text references departments(id) on delete restrict,
  granted_by text references public.users(user_id) on delete set null,
  granted_at timestamptz not null default now(),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_system_roles_grant_unique
  on user_system_roles (
    user_id,
    role_key,
    scope_type,
    coalesce(scope_business_unit_id, ''),
    coalesce(scope_site_id, ''),
    coalesce(scope_department_id, '')
  );

create index if not exists user_system_roles_user_idx
  on user_system_roles (user_id)
  where is_active = true;

create index if not exists user_system_roles_role_idx
  on user_system_roles (role_key)
  where is_active = true;

drop trigger if exists user_system_roles_set_updated_at on user_system_roles;
create trigger user_system_roles_set_updated_at
  before update on user_system_roles
  for each row execute function set_updated_at();

create or replace function enforce_user_system_role_scope()
returns trigger as $$
begin
  if new.scope_type in ('GLOBAL', 'SELF') then
    if new.scope_business_unit_id is not null
      or new.scope_site_id is not null
      or new.scope_department_id is not null then
      raise exception 'scope_type % must not set scope_business_unit_id, scope_site_id, or scope_department_id',
        new.scope_type;
    end if;
    return new;
  end if;

  if new.scope_type = 'BUSINESS_UNIT' then
    if new.scope_business_unit_id is null then
      raise exception 'scope_type BUSINESS_UNIT requires scope_business_unit_id';
    end if;
    if new.scope_site_id is not null or new.scope_department_id is not null then
      raise exception 'scope_type BUSINESS_UNIT must only set scope_business_unit_id';
    end if;
    return new;
  end if;

  if new.scope_type = 'SITE' then
    if new.scope_site_id is null then
      raise exception 'scope_type SITE requires scope_site_id';
    end if;
    if new.scope_business_unit_id is not null or new.scope_department_id is not null then
      raise exception 'scope_type SITE must only set scope_site_id';
    end if;
    return new;
  end if;

  if new.scope_type = 'DEPARTMENT' then
    if new.scope_department_id is null then
      raise exception 'scope_type DEPARTMENT requires scope_department_id';
    end if;
    if new.scope_business_unit_id is not null or new.scope_site_id is not null then
      raise exception 'scope_type DEPARTMENT must only set scope_department_id';
    end if;
    return new;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists user_system_roles_scope_check on user_system_roles;
create trigger user_system_roles_scope_check
  before insert or update on user_system_roles
  for each row execute function enforce_user_system_role_scope();

-- ---------------------------------------------------------------------------
-- 3. Read helper — active grants with resolved scope labels
-- ---------------------------------------------------------------------------
create or replace view user_system_roles_expanded as
select
  usr.id,
  usr.user_id,
  usr.role_key,
  srd.label as role_label,
  usr.scope_type,
  usr.scope_business_unit_id,
  bu.label as scope_business_unit_label,
  usr.scope_site_id,
  st.label as scope_site_label,
  usr.scope_department_id,
  d.label as scope_department_label,
  usr.granted_by,
  usr.granted_at,
  usr.is_active
from user_system_roles usr
join system_role_definitions srd on srd.role_key = usr.role_key
left join business_units bu on bu.id = usr.scope_business_unit_id
left join sites st on st.id = usr.scope_site_id
left join departments d on d.id = usr.scope_department_id
where usr.is_active = true
  and srd.is_active = true;

-- ---------------------------------------------------------------------------
-- 4. Audit log scope for role grants
-- ---------------------------------------------------------------------------
do $$
declare
  con record;
begin
  for con in
    select pgc.conname
    from pg_constraint pgc
    join pg_class rel on rel.oid = pgc.conrelid
    where rel.relname = 'system_config_audit_log'
      and pgc.contype = 'c'
      and pg_get_constraintdef(pgc.oid) ilike '%config_scope%'
  loop
    execute format('alter table system_config_audit_log drop constraint %I', con.conname);
  end loop;
end $$;

alter table system_config_audit_log
  add constraint system_config_audit_log_config_scope_check
  check (config_scope in (
    'business_logic', 'form_definition', 'option',
    'org_structure', 'pay_grade', 'pay_grade_history', 'user_assignment',
    'system_role', 'user_system_role'
  ));

-- ---------------------------------------------------------------------------
-- Reference only — optional backfill from legacy users.role (NOT executed).
-- Review and run manually once you are ready to seed grants from old data:
--
-- insert into user_system_roles (user_id, role_key, scope_type)
-- select user_id, 'SYSTEM_ADMIN', 'GLOBAL'
-- from public.users where role = 'super_admin'
-- on conflict do nothing;
--
-- insert into user_system_roles (user_id, role_key, scope_type)
-- select user_id, 'HR_MANAGER', 'GLOBAL'
-- from public.users where role = 'admin'
-- on conflict do nothing;
--
-- insert into user_system_roles (user_id, role_key, scope_type)
-- select user_id, 'SUPERVISOR', 'GLOBAL'
-- from public.users where role = 'manager'
-- on conflict do nothing;
--
-- insert into user_system_roles (user_id, role_key, scope_type)
-- select user_id, 'STANDARD_EMPLOYEE', 'SELF'
-- from public.users where role = 'employee'
-- on conflict do nothing;
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
