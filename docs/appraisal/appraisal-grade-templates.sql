-- ============================================================================
-- Appraisal grade templates — one appraisal question set per exact org
-- combination (Site + Business unit + Department + Section + Position +
-- Grade level), replacing the old global L1-L7 grade-band system.
--
-- Run once in the Supabase SQL editor, then:
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================

create table if not exists appraisal_grade_templates (
  id uuid primary key default gen_random_uuid(),

  site_id uuid not null references sites(id) on delete cascade,
  business_unit_id uuid not null references business_units(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  position_id uuid not null references custom_position(id) on delete cascade,
  grade_level_id uuid not null references grade_levels(id) on delete cascade,

  -- Each entry: { key, title, items: string[], weight: number (0-1) }
  quarterly_sections jsonb not null default '[]'::jsonb,
  annual_sections jsonb not null default '[]'::jsonb,

  -- Each entry: { id, label, description?, sectionKey, weight, enabled }
  -- Applied on top of quarterly/annual weights when enabled — a simplified,
  -- always-on version of the old grade-band weight rules, since the grade
  -- is already fixed by this template rather than a threshold to check.
  extra_rules jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    site_id, business_unit_id, department_id,
    section_id, position_id, grade_level_id
  )
);

create index if not exists appraisal_grade_templates_lookup_idx
  on appraisal_grade_templates (
    site_id, business_unit_id, department_id,
    section_id, position_id, grade_level_id
  );

notify pgrst, 'reload schema';
