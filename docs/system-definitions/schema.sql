-- ============================================================================
-- System Definitions — database schema (PostgreSQL / Supabase)
-- Run once in the Supabase SQL editor for the Wills Farms project.
--
-- Mirrors the module registry: Git holds builtin defaults; these tables store
-- admin-editable overrides and dropdown option lists for all modules.
-- No Postgres RLS — same pattern as leave_requests, manuals, tm_* tables;
-- Next.js API routes use the service-role key and enforce access in code.
-- ============================================================================

-- Module overrides (one row per module id, e.g. mod:leave)
-- Builtin modules stay defined in Git (modLeave.ts, etc.). Rows here hold
-- admin-edited slices. Null JSON columns mean "use Git default".
-- Absence of a row entirely ALSO means "use Git default for everything" —
-- app code must handle both cases the same way.

create table if not exists system_modules (
  module_id text primary key,
  source text not null default 'override',
  form_definition jsonb,
  list_view jsonb,
  business_logic jsonb,
  option_lists jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint system_modules_source_check
    check (source in ('override', 'dynamic'))
);

-- Dropdown options (all modules, one table)
-- option_list examples: leave.types, sop.categories, policies.categories

create table if not exists system_options (
  id text primary key,
  module_id text not null,
  option_list text not null,
  label text not null,
  legacy_value text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_options_module_list_legacy_unique
    unique (module_id, option_list, legacy_value)
);

create index if not exists system_options_module_list_idx
  on system_options (module_id, option_list, is_active, sort_order);

-- Auto-maintain updated_at on every UPDATE, so API routes never need to
-- remember to set it manually.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists system_modules_set_updated_at on system_modules;
create trigger system_modules_set_updated_at
  before update on system_modules
  for each row execute function set_updated_at();

drop trigger if exists system_options_set_updated_at on system_options;
create trigger system_options_set_updated_at
  before update on system_options
  for each row execute function set_updated_at();

-- Placeholder row so mod:leave is a resolvable module_id. annualLeaveCapDays
-- defaults to 30; editable in System Definitions → Leave → Leave policy.
insert into system_modules (module_id, source, enabled, business_logic)
values ('mod:leave', 'override', true, '{"annualLeaveCapDays": 30}'::jsonb)
on conflict (module_id) do nothing;

-- Seed Leave types (first module pilot)
insert into system_options
  (id, module_id, option_list, label, legacy_value, sort_order, rules)
values
  ('opt:leave:type:annual', 'mod:leave', 'leave.types', 'Annual', 'Annual', 1, '{}'::jsonb),
  ('opt:leave:type:sick', 'mod:leave', 'leave.types', 'Sick', 'Sick', 2, '{"requires_document": true}'::jsonb),
  ('opt:leave:type:emergency', 'mod:leave', 'leave.types', 'Emergency', 'Emergency', 3, '{}'::jsonb),
  ('opt:leave:type:maternity', 'mod:leave', 'leave.types', 'Maternity/Paternity', 'Maternity/Paternity', 4, '{}'::jsonb),
  ('opt:leave:type:unpaid', 'mod:leave', 'leave.types', 'Unpaid', 'Unpaid', 5, '{}'::jsonb),
  ('opt:leave:type:other', 'mod:leave', 'leave.types', 'Other', 'Other', 6, '{"requires_reason": true}'::jsonb)
on conflict (id) do nothing;

-- Supporting document on leave requests
alter table leave_requests
  add column if not exists document_url text;