-- ============================================================================
-- Skill log templates — one competency form per exact org combination
-- (Site + Business unit + Department + Section + Position + Grade level),
-- same scoping as appraisal_grade_templates.
--
-- Run once in the Supabase SQL editor, then:
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================

create table if not exists skill_log_templates (
  id uuid primary key default gen_random_uuid(),

  site_id uuid not null references sites(id) on delete cascade,
  business_unit_id uuid not null references business_units(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  position_id uuid not null references custom_position(id) on delete cascade,
  grade_level_id uuid not null references grade_levels(id) on delete cascade,

  -- Each entry: { key, title, skills: string[] }
  sections jsonb not null default '[]'::jsonb,

  -- Options shown on the live fill form's Tier authorisation dropdown
  tier_auth_options jsonb not null default
    '["None yet","GP","PS","External GGP semen handling"]'::jsonb,

  -- Multiple competency forms per template: [{ name, sections: [{ key, title, skills }] }]
  skill_variants jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    site_id, business_unit_id, department_id,
    section_id, position_id, grade_level_id
  )
);

create index if not exists skill_log_templates_lookup_idx
  on skill_log_templates (
    site_id, business_unit_id, department_id,
    section_id, position_id, grade_level_id
  );

alter table skill_log_templates
  add column if not exists tier_auth_options jsonb not null default
    '["None yet","GP","PS","External GGP semen handling"]'::jsonb;

alter table skill_log_templates
  add column if not exists skill_variants jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
