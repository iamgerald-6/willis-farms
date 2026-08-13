-- ── SOP archive + audit log ─────────────────────────────────────────────
-- Adds archive support to `content` (SOPs) and a lightweight audit trail
-- mirroring tm_task_audit_log (see docs/task-manager/schema.sql), so SOP
-- Management can show a History panel — who added / edited / archived /
-- restored / deleted a SOP, and when — and an Archive button that hides a
-- SOP from the main list without deleting it.
--
-- Additive only: safe to run against the existing `content` table.
--
-- Assumes content.id is uuid, matching the uuid convention used by every
-- other audit-logged table in this project (tm_tasks/tm_task_audit_log,
-- appraisals, etc). If content.id turns out to be a different type, change
-- sop_audit_log.content_id to match before running this.

alter table content
  add column if not exists archived_at timestamptz;

create table if not exists sop_audit_log (
  id uuid primary key default gen_random_uuid(),

  -- Deliberately NOT a foreign key to content(id) — a "deleted" entry has
  -- to survive the content row's own hard delete. Same reasoning as
  -- tm_project_deletions in docs/task-manager/project-audit-log.sql. The
  -- title is snapshotted here too, so history stays readable even after
  -- the SOP itself is gone.
  content_id uuid not null,
  content_title text not null,

  action text not null check (action in ('added', 'edited', 'archived', 'restored', 'deleted')),

  performed_by uuid not null,
  performed_by_name text not null,
  performed_at timestamptz not null default now()
);

create index if not exists sop_audit_content_id_idx on sop_audit_log(content_id);
create index if not exists sop_audit_performed_at_idx on sop_audit_log(performed_at desc);
