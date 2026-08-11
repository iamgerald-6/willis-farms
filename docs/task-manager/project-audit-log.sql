-- ============================================================================
-- Task Manager — project-level audit log + deletion tombstone
-- Run this once in the Supabase SQL editor for the Wills Farms project.
-- Purely additive — two new tables, no changes to any existing one.
-- ============================================================================

-- ── Project audit log ────────────────────────────────────────────────────
-- Mirrors tm_task_audit_log, but for the project itself: created, renamed
-- (name and/or description), archived, restored. There's no AI-extracted vs
-- manual distinction here — only tasks can be AI-extracted, not projects.
-- Deletion is NOT tracked in this table — a project's own audit log rows
-- cascade-delete along with it (see the FK below), so a permanent deletion
-- is recorded separately in tm_project_deletions instead, which deliberately
-- does NOT reference tm_projects and survives the delete.
create table if not exists tm_project_audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references tm_projects(id) on delete cascade,

  action text not null check (action in ('created', 'renamed', 'archived', 'restored')),
  changed_fields jsonb,          -- e.g. ["name", "description"]
  previous_values jsonb,
  new_values jsonb,

  performed_by uuid not null,
  performed_by_name text not null,
  performed_at timestamptz not null default now()
);

create index if not exists tm_project_audit_project_id_idx on tm_project_audit_log(project_id);

-- ── Project deletion tombstone ──────────────────────────────────────────
-- A small, permanent record of who deleted a project and when — deliberately
-- kept separate from tm_project_audit_log (which cascade-deletes with its
-- project) and with no FK back to tm_projects, so this row is the one thing
-- that survives the project's own hard/cascading delete. Shown as a short
-- "Recently Deleted Projects" read-only list in Manage Projects — there is
-- no restore; deletion stays instant and permanent, this is just a record of
-- who did it and when.
create table if not exists tm_project_deletions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,      -- not a FK — the project row is gone by the time this is read
  project_name text not null,

  deleted_by uuid not null,
  deleted_by_name text not null,
  deleted_at timestamptz not null default now()
);

create index if not exists tm_project_deletions_deleted_at_idx on tm_project_deletions(deleted_at);
