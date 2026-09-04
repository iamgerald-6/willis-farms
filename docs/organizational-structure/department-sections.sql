-- ============================================================================
-- Organizational structure — Department/division ↔ Section mapping
-- Run once in the Supabase SQL editor, after docs/organizational-structure/
-- schema.sql (this references departments and sections).
--
-- Records which sections belong to which department/division. Mirrors
-- site_business_units.sql — same many-to-many junction table pattern.
--
-- No Postgres RLS — same pattern as the rest of Organizational Structure;
-- Next.js API routes use the service-role key and enforce access in code.
-- ============================================================================

create table if not exists department_sections (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (department_id, section_id)
);

create index if not exists department_sections_department_id_idx
  on department_sections (department_id);
create index if not exists department_sections_section_id_idx
  on department_sections (section_id);

notify pgrst, 'reload schema';
