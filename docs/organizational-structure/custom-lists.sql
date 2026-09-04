-- ============================================================================
-- Organizational structure — Set up: custom list types
-- Run once in the Supabase SQL editor, after docs/organizational-structure/
-- schema.sql. Lets an admin add a brand new catalog (beyond the fixed Sites,
-- Business units, Departments/divisions, Sections, Grade levels) from the
-- Set up page itself, choosing which extra fields it needs.
--
-- org_custom_list_types — one row per custom list an admin created. Every
--   custom list gets the same built-in fields as the 5 fixed lists (label,
--   code, region, sort_order, is_active, notes) plus whatever extra fields
--   the admin defined, stored as JSON in `fields`:
--     [{ "key": "budget_code", "label": "Budget code", "type": "text" }, ...]
--   Supported field types: text, number, boolean, date, select (select
--   fields carry an "options": string[] array too).
-- org_custom_list_items — the rows for every custom list. custom_fields
--   holds the values for whatever's defined in the parent type's `fields`,
--   keyed by each field's `key`.
--
-- No Postgres RLS — same pattern as the rest of Organizational Structure;
-- Next.js API routes use the service-role key and enforce access in code.
-- ============================================================================

create table if not exists org_custom_list_types (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  singular text not null,
  code text not null unique,
  has_region boolean not null default false,
  fields jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_custom_list_types_sort_order_idx
  on org_custom_list_types (sort_order);

create table if not exists org_custom_list_items (
  id uuid primary key default gen_random_uuid(),
  list_type_id uuid not null references org_custom_list_types(id) on delete cascade,
  label text not null,
  code text not null,
  region text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_type_id, code)
);

create index if not exists org_custom_list_items_list_type_id_idx
  on org_custom_list_items (list_type_id);
create index if not exists org_custom_list_items_active_sort_idx
  on org_custom_list_items (list_type_id, is_active, sort_order);

-- Reuses the set_updated_at() function already created by schema.sql — no
-- need to redefine it here, just attach it to the two new tables.
drop trigger if exists org_custom_list_types_set_updated_at on org_custom_list_types;
create trigger org_custom_list_types_set_updated_at
  before update on org_custom_list_types
  for each row execute function set_updated_at();

drop trigger if exists org_custom_list_items_set_updated_at on org_custom_list_items;
create trigger org_custom_list_items_set_updated_at
  before update on org_custom_list_items
  for each row execute function set_updated_at();

notify pgrst, 'reload schema';
