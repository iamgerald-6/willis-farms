-- ============================================================================
-- Occupational Medical Examination — form template + per-candidate instances
--
-- One global template (versioned). Each onboarding candidate gets an instance
-- when HR sends the hospital link. Submitted instances keep their frozen
-- form_schema until HR resends (new token + optional new draft instance).
--
-- Run once in Supabase SQL editor, then: NOTIFY pgrst, 'reload schema';
-- ============================================================================

create table if not exists medical_form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Occupational Medical Examination Form',
  active_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists medical_form_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references medical_form_templates(id) on delete cascade,
  version_number int not null,
  source_file_url text,
  source_file_name text,
  source_cloudinary_public_id text,
  form_schema jsonb not null default '{}'::jsonb,
  extracted_at timestamptz,
  published_at timestamptz,
  published_by uuid,
  published_by_name text,
  created_at timestamptz not null default now(),
  unique (template_id, version_number)
);

create index if not exists medical_form_template_versions_template_idx
  on medical_form_template_versions (template_id, version_number desc);

alter table medical_form_templates
  drop constraint if exists medical_form_templates_active_version_fk;

alter table medical_form_templates
  add constraint medical_form_templates_active_version_fk
  foreign key (active_version_id) references medical_form_template_versions(id) on delete set null;

create table if not exists medical_examinations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references job_applications(id) on delete cascade,
  template_version_id uuid references medical_form_template_versions(id) on delete set null,
  form_schema jsonb not null default '{}'::jsonb,
  referral_data jsonb not null default '{}'::jsonb,
  form_responses jsonb not null default '{"fields":{},"tables":{}}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  hospital_email text,
  link_sent_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id)
);

create index if not exists medical_examinations_application_idx
  on medical_examinations (application_id);

create table if not exists medical_examination_tokens (
  id uuid primary key default gen_random_uuid(),
  examination_id uuid not null references medical_examinations(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists medical_examination_tokens_examination_idx
  on medical_examination_tokens (examination_id);

-- medical_examinations is one row per candidate (unique application_id) —
-- "Resend new link" resets that row to a fresh draft for the next cycle
-- (periodic re-exam, correction, etc). Before that reset happens, the
-- previous cycle's data is archived here so HR never loses what a hospital
-- already submitted. Self-contained snapshot — not a live reference.
create table if not exists medical_examination_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references job_applications(id) on delete cascade,
  examination_id uuid,
  template_version_id uuid references medical_form_template_versions(id) on delete set null,
  form_schema jsonb not null default '{}'::jsonb,
  referral_data jsonb not null default '{}'::jsonb,
  form_responses jsonb not null default '{}'::jsonb,
  status text not null default 'submitted',
  hospital_email text,
  link_sent_at timestamptz,
  submitted_at timestamptz,
  archived_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists medical_examination_history_application_idx
  on medical_examination_history (application_id, archived_at desc);

notify pgrst, 'reload schema';
