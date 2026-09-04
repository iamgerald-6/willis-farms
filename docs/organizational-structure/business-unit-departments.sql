-- ============================================================================
-- Organizational structure — Business unit ↔ Department/division mapping
-- Run once in the Supabase SQL editor, after docs/organizational-structure/
-- schema.sql (this references business_units and departments).
--
-- Records which departments/divisions belong to which business unit. Mirrors
-- site_business_units.sql — same many-to-many junction table pattern.
--
-- No Postgres RLS — same pattern as the rest of Organizational Structure;
-- Next.js API routes use the service-role key and enforce access in code.
-- ============================================================================

create table if not exists business_unit_departments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (business_unit_id, department_id)
);

create index if not exists business_unit_departments_business_unit_id_idx
  on business_unit_departments (business_unit_id);
create index if not exists business_unit_departments_department_id_idx
  on business_unit_departments (department_id);

notify pgrst, 'reload schema';
