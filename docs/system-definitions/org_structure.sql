-- ============================================================================
-- Organisational structure — dedicated tables (the "house foundation")
-- Run once in the Supabase SQL editor for the Wills Farms project.
--
-- Phase 1, step 1 of the org-hierarchy / multi-role / decoupled-RBAC rework.
--
-- This is the structural foundation: five real tables, one per level, each
-- with a foreign key that can ONLY point at the table one level above it.
-- System Definitions (the editable "interior" — forms, business rules,
-- dropdown option lists) is a later, separate layer built on top of this;
-- nothing here depends on it and nothing in System Definitions is touched
-- by this file.
--
-- Fixed structure:
--   business_units -> sites -> departments -> [sections] -> positions
--
-- Business Unit / Site / Department are strict — never skippable, and this
-- is enforced by the schema itself (a `sites` row physically cannot
-- reference a `departments` row — the foreign key column only knows how to
-- point at `business_units`). Section is the one optional layer: a position
-- can belong directly to a department (no section yet, e.g. Pork) or to a
-- section within that department (e.g. Genetics) — decided per position,
-- with no expiry once a sibling section exists elsewhere.
--
-- Dynamic within a fixed shape: the 5 kinds of node are fixed, but each
-- table can hold unlimited rows — add, rename, move (re-parent via UPDATE),
-- or deactivate any Business Unit/Site/Department/Section/Position with
-- plain INSERT/UPDATE, no migration, ever, for row-level changes.
--
-- Depends on docs/system-definitions/schema.sql and audit-log.sql already
-- having been run (uses set_updated_at() and system_config_audit_log).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. business_units — top level. No parent. "Group Shared Services" is
--    seeded below because the spec requires it; every other Business Unit
--    (Genetics, Pork, ...) is domain data left for the business to add.
-- ---------------------------------------------------------------------------
create table if not exists business_units (
  id text primary key,
  label text not null,
  code text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists business_units_set_updated_at on business_units;
create trigger business_units_set_updated_at
  before update on business_units
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. sites — one or many per business unit (e.g. Genetics can have several
--    farm locations). business_unit_id can ONLY reference business_units.
-- ---------------------------------------------------------------------------
create table if not exists sites (
  id text primary key,
  business_unit_id text not null references business_units(id) on delete restrict,
  label text not null,
  code text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sites_business_unit_code_unique unique (business_unit_id, code)
);

create index if not exists sites_business_unit_idx on sites (business_unit_id);

drop trigger if exists sites_set_updated_at on sites;
create trigger sites_set_updated_at
  before update on sites
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. departments — one or many per site. site_id can ONLY reference sites.
-- ---------------------------------------------------------------------------
create table if not exists departments (
  id text primary key,
  site_id text not null references sites(id) on delete restrict,
  label text not null,
  code text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_site_code_unique unique (site_id, code)
);

create index if not exists departments_site_idx on departments (site_id);

drop trigger if exists departments_set_updated_at on departments;
create trigger departments_set_updated_at
  before update on departments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. sections — OPTIONAL layer under a department. department_id can ONLY
--    reference departments. A department with zero sections is valid and
--    permanent (Pork today); a department can have sections while a sibling
--    department in the same business unit has none.
-- ---------------------------------------------------------------------------
create table if not exists sections (
  id text primary key,
  department_id text not null references departments(id) on delete restrict,
  label text not null,
  code text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sections_department_code_unique unique (department_id, code)
);

create index if not exists sections_department_idx on sections (department_id);

drop trigger if exists sections_set_updated_at on sections;
create trigger sections_set_updated_at
  before update on sections
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. positions — the leaf / the actual job. department_id is REQUIRED
--    (always traceable to a department at minimum); section_id is OPTIONAL.
--    When section_id is set, it must belong to the SAME department_id —
--    enforced by the trigger below, since a plain FK can't cross-check a
--    sibling column's value.
-- ---------------------------------------------------------------------------
create table if not exists positions (
  id text primary key,
  department_id text not null references departments(id) on delete restrict,
  section_id text references sections(id) on delete restrict,
  label text not null,
  code text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positions_department_code_unique unique (department_id, code)
);

create index if not exists positions_department_idx on positions (department_id);
create index if not exists positions_section_idx on positions (section_id);

drop trigger if exists positions_set_updated_at on positions;
create trigger positions_set_updated_at
  before update on positions
  for each row execute function set_updated_at();

-- A position's section (when set) must belong to the position's own
-- department — stops "Slaughter Technician" (Pork/Slaughter dept) from
-- being pointed at a section that actually belongs to Genetics/Breeding.
create or replace function enforce_position_section_matches_department()
returns trigger as $$
declare
  section_dept_id text;
begin
  if new.section_id is not null then
    select department_id into section_dept_id
    from sections
    where id = new.section_id;

    if section_dept_id is null then
      raise exception 'section % does not exist', new.section_id;
    end if;

    if section_dept_id <> new.department_id then
      raise exception
        'section % belongs to department %, not % — a position''s section must belong to its own department',
        new.section_id, section_dept_id, new.department_id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists positions_section_department_match on positions;
create trigger positions_section_department_match
  before insert or update on positions
  for each row execute function enforce_position_section_matches_department();

-- ---------------------------------------------------------------------------
-- 6. Allow the existing config-audit log to record org-structure changes
--    (same system_config_audit_log used by leave policy, appraisal weights,
--    etc. — module_id = 'mod:org-structure', entity_key = the row id in
--    whichever of the 5 tables above changed).
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
  check (config_scope in ('business_logic', 'form_definition', 'option', 'org_structure'));

insert into system_modules (module_id, source, enabled)
values ('mod:org-structure', 'override', true)
on conflict (module_id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Seed: Group Shared Services — the one piece of org data the spec
--    requires up front (corporate roles must sit under a dedicated top-level
--    Business Unit, not anchored to an operational site). No sites,
--    departments, sections, or positions are invented here — that's domain
--    data for the business to add.
-- ---------------------------------------------------------------------------
insert into business_units (id, label, code, sort_order)
values ('bu:group-shared-services', 'Group Shared Services', 'group_shared_services', 0)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Verification view — fixed-depth join (no recursion needed, since the
--    shape is fixed at 5 levels), so every position always shows its full
--    lineage. Section is LEFT JOINed since it's optional.
--
--    Example: select * from org_structure_positions order by business_unit_label, site_label;
-- ---------------------------------------------------------------------------
create or replace view org_structure_positions as
select
  p.id as position_id,
  p.label as position_label,
  p.code as position_code,
  p.is_active as position_is_active,
  d.id as department_id,
  d.label as department_label,
  s.id as section_id,
  s.label as section_label,
  st.id as site_id,
  st.label as site_label,
  bu.id as business_unit_id,
  bu.label as business_unit_label
from positions p
join departments d on d.id = p.department_id
left join sections s on s.id = p.section_id
join sites st on st.id = d.site_id
join business_units bu on bu.id = st.business_unit_id;

-- ---------------------------------------------------------------------------
-- Reference only — NOT executed. Shows the shape once you start adding real
-- org data:
--
-- insert into sites (id, business_unit_id, label, code)
--   values ('site:head-office', 'bu:group-shared-services', 'Head Office', 'head_office');
--
-- insert into departments (id, site_id, label, code)
--   values ('dept:hr', 'site:head-office', 'Human Resources', 'hr');
--
-- -- Genetics: department WITH a section
-- insert into sections (id, department_id, label, code)
--   values ('sec:hr-generalist', 'dept:hr', 'HR Generalist', 'hr_generalist');
-- insert into positions (id, department_id, section_id, label, code)
--   values ('pos:hr-manager', 'dept:hr', 'sec:hr-generalist', 'HR Manager', 'hr_manager');
--
-- -- Pork: department WITHOUT a section yet — section_id left null
-- insert into positions (id, department_id, section_id, label, code)
--   values ('pos:pork-slaughter-tech', 'dept:pork-slaughter', null, 'Slaughter Technician', 'pork_slaughter_tech');
--
-- -- Later, once Pork adds a section, re-parent with a plain UPDATE —
-- -- no new position, no schema change, existing assignments unaffected:
-- update positions
--   set section_id = 'sec:pork-slaughter-line-1'
--   where id = 'pos:pork-slaughter-tech';
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
