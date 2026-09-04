-- ============================================================================
-- Organizational structure — database schema (PostgreSQL / Supabase)
-- Run once in the Supabase SQL editor for the Wills Farms project.
--
-- Five company-wide catalogs: Sites, Business units, Departments / divisions,
-- Sections, Grade levels. Each is its own table (not a shared generic list),
-- so a future new list type would need its own migration file like this one
-- rather than a runtime "add list" action.
--
-- These tables are flat and unscoped — they do NOT yet record which of these
-- apply to which site. That assignment step is a separate, not-yet-built
-- piece and is intentionally left out of this migration.
--
-- No Postgres RLS — same pattern as system_modules, system_options, tm_*
-- tables; Next.js API routes use the service-role key and enforce access
-- in code (see src/lib/apiRequestAuth.ts — requireSystemDefinitionsAccess).
-- ============================================================================

create extension if not exists "pgcrypto";

-- Auto-maintain updated_at on every UPDATE. Safe to re-run if this function
-- already exists from docs/system-definitions/schema.sql.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── Sites ────────────────────────────────────────────────────────────────
-- The only one of the five with a region column.
create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  code text not null unique,       -- auto-derived from label (snake_case) at create time; stable after that
  region text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sites_is_active_sort_order_idx
  on sites (is_active, sort_order);

drop trigger if exists sites_set_updated_at on sites;
create trigger sites_set_updated_at
  before update on sites
  for each row execute function set_updated_at();

-- ── Business units ──────────────────────────────────────────────────────
create table if not exists business_units (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  code text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_units_is_active_sort_order_idx
  on business_units (is_active, sort_order);

drop trigger if exists business_units_set_updated_at on business_units;
create trigger business_units_set_updated_at
  before update on business_units
  for each row execute function set_updated_at();

-- ── Departments / divisions ─────────────────────────────────────────────
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  code text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists departments_is_active_sort_order_idx
  on departments (is_active, sort_order);

drop trigger if exists departments_set_updated_at on departments;
create trigger departments_set_updated_at
  before update on departments
  for each row execute function set_updated_at();

-- ── Sections ─────────────────────────────────────────────────────────────
create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  code text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sections_is_active_sort_order_idx
  on sections (is_active, sort_order);

drop trigger if exists sections_set_updated_at on sections;
create trigger sections_set_updated_at
  before update on sections
  for each row execute function set_updated_at();

-- ── Grade levels ─────────────────────────────────────────────────────────
-- Note: this is a new, separate catalog table for the organizational
-- structure redesign — distinct from the existing config-driven grade
-- levels in src/lib/systemDefinitions/gradeLevelsConfig.ts. Reconciling the
-- two was not part of what's been discussed yet.
create table if not exists grade_levels (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  code text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grade_levels_is_active_sort_order_idx
  on grade_levels (is_active, sort_order);

drop trigger if exists grade_levels_set_updated_at on grade_levels;
create trigger grade_levels_set_updated_at
  before update on grade_levels
  for each row execute function set_updated_at();

notify pgrst, 'reload schema';
