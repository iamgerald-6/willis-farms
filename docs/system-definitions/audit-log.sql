-- ============================================================================
-- System Definitions — config audit log
-- Run this once in the Supabase SQL editor for the Wills Farms project.
--
-- Every save made through the System Definitions screens (business rules,
-- leave policy, appraisal weights, grade levels, application/onboarding
-- forms, job postings, and every dropdown option list) is written here as an
-- old-value -> new-value row, so a policy change (e.g. annual leave cap
-- 30 -> 20) can always be traced: what it used to be, what it became, who
-- changed it, and exactly when. This lets an employee point to the date they
-- applied and an auditor/CEO confirm what the rule actually was on that date.
--
-- Follows the same convention as tm_task_audit_log / sop_audit_log /
-- policy_audit_log: no Postgres RLS; only ever written/read through the
-- Next.js API routes using the service-role key.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists system_config_audit_log (
  id uuid primary key default gen_random_uuid(),

  module_id text not null,        -- e.g. 'mod:leave', 'mod:appraisal', 'mod:recruitment'
  config_scope text not null check (config_scope in ('business_logic', 'form_definition', 'option')),
  entity_key text,                 -- business_logic field name, or the system_options row id
  entity_label text,                -- human-readable name shown in the log (module or option label)

  action text not null check (action in ('created', 'updated', 'deactivated', 'reactivated')),
  changed_fields jsonb,             -- e.g. ["annualLeaveCapDays"] or ["label", "sort_order"]
  previous_values jsonb,            -- keyed by field name, old value
  new_values jsonb,                 -- keyed by field name, new value

  performed_by uuid not null,
  performed_by_name text not null,
  performed_at timestamptz not null default now()
);

create index if not exists system_config_audit_module_idx on system_config_audit_log(module_id);
create index if not exists system_config_audit_performed_at_idx on system_config_audit_log(performed_at desc);
create index if not exists system_config_audit_entity_idx on system_config_audit_log(entity_key);
