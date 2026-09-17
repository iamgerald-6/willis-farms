-- ============================================================================
-- Performance Improvement Plan (PIP) — live instances (Phase 2)
--
-- One PIP per appraisal, created after the final review meeting when the
-- employee's final quarter score is below the promotion threshold (< 70%).
-- The form structure is snapshotted from pip_form_template_versions at
-- creation time so later template edits don't change an in-flight PIP.
--
-- Prerequisite: docs/appraisal/pip-form-templates.sql must already be applied.
--
-- Run once in the Supabase SQL editor, then:
--   NOTIFY pgrst, 'reload schema';
--
-- NOTE: appraisals.id may be integer (legacy) or uuid depending on your DB.
-- This script detects the column type and creates a matching FK.
-- users.user_id is varchar on the live database — employee_user_id is text.
-- ============================================================================

do $$
declare
  appraisal_id_sql_type text;
begin
  select udt_name
  into appraisal_id_sql_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'appraisals'
    and column_name = 'id';

  if appraisal_id_sql_type is null then
    raise exception 'appraisals.id column not found — run appraisal migrations first.';
  end if;

  if appraisal_id_sql_type not in ('int4', 'int8', 'uuid') then
    raise exception 'Unsupported appraisals.id type: %. Expected int4, int8, or uuid.', appraisal_id_sql_type;
  end if;

  execute format($create$
    create table if not exists appraisal_pips (
      id uuid primary key default gen_random_uuid(),

      appraisal_id %1$s not null references appraisals(id) on delete cascade,

      -- Matches users.user_id (character varying on live DB).
      employee_user_id text not null references users(user_id) on delete restrict,

      pip_template_id uuid not null references pip_form_templates(id) on delete restrict,
      template_version_id uuid not null references pip_form_template_versions(id) on delete restrict,

      form_schema jsonb not null default '{}'::jsonb,
      form_responses jsonb not null default '{}'::jsonb,

      status text not null default 'draft'
        check (status in ('draft', 'active', 'completed')),

      created_by text,
      created_by_name text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      unique (appraisal_id)
    )
  $create$,
    case appraisal_id_sql_type
      when 'int4' then 'integer'
      when 'int8' then 'bigint'
      when 'uuid' then 'uuid'
    end
  );
end $$;

create index if not exists appraisal_pips_employee_idx
  on appraisal_pips (employee_user_id);

create index if not exists appraisal_pips_appraisal_idx
  on appraisal_pips (appraisal_id);

notify pgrst, 'reload schema';
