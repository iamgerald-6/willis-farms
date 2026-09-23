-- ============================================================================
-- Performance Improvement Plan (PIP) — form templates (origin/setup only)
--
-- Phase 1 of the PIP feature, same design as appraisal_grade_templates (see
-- docs/appraisal/appraisal-grade-templates.sql): one PIP template per exact
-- org combination — Site + Business unit + Department + Section + Position +
-- Grade level — matched against an employee's own org placement. HR picks a
-- combination in "Manage appraisals" → "PIP form setup" (creating a blank
-- template if none exists yet for it, same find-or-create pattern), then
-- either clicks "Add section" to build it by hand or uploads a document
-- ("Prefill with WillsOne Intel") to have AI fill in the sections/fields.
--
-- Deliberately NOT included in this migration (Phase 2+):
--   - appraisal_pips (the live, per-employee PIP instance table)
--   - eligibility/threshold wiring on the appraisal itself
--   - any employee/supervisor-facing PIP form UI
--
-- Safe to run even if an earlier, differently-shaped version of these two
-- tables was created (the feature had zero real usage before this
-- redesign — the earlier shape is dropped, not migrated).
--
-- Run once in the Supabase SQL editor, then:
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- Drop the active-version FK first — pip_form_templates.active_version_id
-- points at pip_form_template_versions, so dropping versions before
-- removing this constraint fails with "other objects depend on it".
alter table if exists pip_form_templates
  drop constraint if exists pip_form_templates_active_version_fk;

drop table if exists pip_form_template_versions;
drop table if exists pip_form_templates;

create table pip_form_templates (
  id uuid primary key default gen_random_uuid(),

  site_id integer not null references sites(id) on delete cascade,
  business_unit_id uuid not null references business_units(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  position_id uuid not null references custom_position(id) on delete cascade,
  grade_level_id uuid not null references grade_levels(id) on delete cascade,

  name text not null default 'Performance Improvement Plan',

  -- Set once the first version is published; FK added below once
  -- pip_form_template_versions exists.
  active_version_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    site_id, business_unit_id, department_id,
    section_id, position_id, grade_level_id
  )
);

create index if not exists pip_form_templates_lookup_idx
  on pip_form_templates (
    site_id, business_unit_id, department_id,
    section_id, position_id, grade_level_id
  );

-- Every save (whether it's the very first build or a later revision, by
-- hand or via re-upload) creates a new version row here — never mutates a
-- previous one. Only one version per template can be "published" (i.e.
-- pip_form_templates.active_version_id points at it) at a time; earlier
-- versions stay in the table for history and so any PIP instance created
-- from them (Phase 2+) keeps its own frozen snapshot.
create table pip_form_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references pip_form_templates(id) on delete cascade,
  version_number int not null,

  -- The source document this version was built/prefilled from, if any —
  -- null when a version was built entirely by hand via "Add section"
  -- without ever uploading anything.
  source_file_url text,
  source_file_name text,
  source_cloudinary_public_id text,

  -- AI-extracted-and/or-hand-edited structure — see
  -- src/lib/appraisal/pipFormSchema.ts for the shape (title, sections[],
  -- each section either a field group or a repeating table; fields in a
  -- field group may be type="system", meaning locked/auto-filled from
  -- tracked data rather than HR-authored content — see PIP_SYSTEM_FIELD_
  -- SOURCES). This is what the (Phase 2+) PIP instance form is rendered
  -- from, and what gets snapshotted onto each instance created from this
  -- version.
  form_schema jsonb not null default '{}'::jsonb,

  extracted_at timestamptz,
  published_at timestamptz,
  published_by uuid,
  published_by_name text,

  created_at timestamptz not null default now(),

  unique (template_id, version_number)
);

create index if not exists pip_form_template_versions_template_idx
  on pip_form_template_versions (template_id, version_number desc);

alter table pip_form_templates
  add constraint pip_form_templates_active_version_fk
  foreign key (active_version_id) references pip_form_template_versions(id) on delete set null;

notify pgrst, 'reload schema';

-- ============================================================================
-- After running: nothing seeds automatically. From "Manage appraisals" →
-- "PIP form setup", HR clicks "New template", picks Site/Business unit/
-- Department/Section/Position/Grade level, then either builds sections by
-- hand or uploads the reference document to prefill them.
-- ============================================================================
