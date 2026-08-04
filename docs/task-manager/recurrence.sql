-- ============================================================================
-- Task Manager — recurring task auto-renewal
-- Run this once in the Supabase SQL editor, same as the earlier files.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Completion history ──────────────────────────────────────────────────
-- Recurring tasks (is_recurring = true) don't actually close when marked
-- complete — the SAME tm_tasks row cycles forward to the next due date
-- instead (see src/lib/taskManagerData.ts / performTaskCompletion), so
-- there's no "completed" row left behind to look back on. This table is
-- that history: one row per cycle actually completed, independent of
-- whatever the task's current due date has since moved on to. The Monthly
-- Report reads this (alongside ordinary completed tm_tasks rows) so a
-- recurring obligation's past completions still count for the period they
-- happened in.
create table if not exists tm_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tm_tasks(id) on delete cascade,
  project_id uuid not null references tm_projects(id) on delete cascade,
  due_date date,                 -- the due date this particular cycle met
  completed_at timestamptz not null default now(),
  completed_by uuid not null,
  completed_by_name text not null
);

create index if not exists tm_task_completions_task_id_idx on tm_task_completions(task_id);
create index if not exists tm_task_completions_project_id_idx on tm_task_completions(project_id);
create index if not exists tm_task_completions_completed_at_idx on tm_task_completions(completed_at);
