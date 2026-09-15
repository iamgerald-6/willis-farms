-- ============================================================================
-- Org-placement audit log — Phase 3 of the multi-site access architecture
-- (see docs/SITE_ACCESS_ARCHITECTURE.md). Run once in the Supabase SQL editor.
--
-- WHY: org-placement edits (site_id, business_unit_id, department_id,
-- section_id, position_id, grade_level_id, user_role_id) on `users` have
-- never been logged — a plain UPDATE with no history, confirmed during the
-- multi-site audit. This means there was no way to tell whether an employee
-- has ever transferred sites, which matters for historical HR records
-- (appraisals, leave, skill logs, promotions) that need to preserve their
-- ORIGINAL site even after a later transfer. This table starts recording
-- every org-placement change going forward — it can't recover anything
-- that already happened before this migration runs, only prevent the same
-- blind spot going forward.
--
-- One row per CHANGED field per PATCH (not one row per request) — same
-- shape as sop_audit_log/policy_audit_log's action-per-event convention,
-- but granular per field since a single org-placement save can change
-- several fields at once and each is independently meaningful (e.g.
-- site_id changing is a transfer; grade_level_id changing alone is not).
-- ============================================================================

create table if not exists org_placement_audit_log (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  field_name text not null check (field_name in (
    'site_id', 'business_unit_id', 'department_id',
    'section_id', 'position_id', 'grade_level_id', 'user_role_id'
  )),
  old_value text,
  new_value text,
  performed_by uuid,
  performed_by_name text,
  performed_at timestamptz not null default now()
);
create index if not exists org_placement_audit_log_target_user_idx
  on org_placement_audit_log (target_user_id, performed_at desc);
create index if not exists org_placement_audit_log_field_idx
  on org_placement_audit_log (field_name);

notify pgrst, 'reload schema';
