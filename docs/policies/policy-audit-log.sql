-- ── Policies & Ops audit log ────────────────────────────────────────────
-- A lightweight audit trail for manuals, mirroring sop_audit_log (see
-- docs/sop/sop-audit-log.sql) — powers a per-manual History panel showing
-- who added / added a new version to / edited / deleted a manual, and when.
--
-- Additive only: safe to run against the existing `manuals` table. No
-- columns are added to `manuals` or `manual_versions` — this is a new,
-- standalone table.
--
-- Assumes manuals.id is uuid, matching every other id column in this
-- project. If manuals.id turns out to be a different type, change
-- policy_audit_log.manual_id to match before running this.

create table if not exists policy_audit_log (
  id uuid primary key default gen_random_uuid(),

  -- Deliberately NOT a foreign key to manuals(id) — a "deleted" entry has
  -- to survive the manual row's own hard delete. Same reasoning as
  -- sop_audit_log.content_id. The title is snapshotted here too, so
  -- history stays readable even after the manual itself is gone.
  manual_id uuid not null,
  manual_title text not null,

  action text not null check (action in ('added', 'version_added', 'edited', 'deleted')),

  -- Optional detail line — e.g. which version was edited/added, or what
  -- changed. Kept short and free-text rather than a structured diff.
  detail text,

  performed_by uuid not null,
  performed_by_name text not null,
  performed_at timestamptz not null default now()
);

create index if not exists policy_audit_manual_id_idx on policy_audit_log(manual_id);
create index if not exists policy_audit_performed_at_idx on policy_audit_log(performed_at desc);
