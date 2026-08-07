-- ============================================================================
-- Task Manager — subtasks
-- Run this once in the Supabase SQL editor, same as the earlier files.
--
-- A task can be broken into subtasks, each nested up to 4 levels deep
-- (parent_id -> parent_id -> parent_id -> parent_id, depth 1-4). Every
-- sibling group (subtasks sharing the same parent_id, including the
-- top-level group directly under the task) must have weight_percent values
-- that sum to exactly 100 — enforced in the API, not here, since Postgres
-- can't express "siblings sum to 100" as a simple column check.
--
-- Only leaf nodes (no children) are ever ticked directly. A parent's
-- completion is always the weighted sum of its children's completion,
-- computed on read (see src/lib/subtaskProgress.ts) and written back onto
-- the task's own progress_percent via the existing updateTaskProgress()
-- path, so a subtask tick reaching 100% auto-completes / recurs the task
-- exactly the way the manual progress slider always has.
-- ============================================================================

create table if not exists tm_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tm_tasks(id) on delete cascade,
  parent_id uuid references tm_subtasks(id) on delete cascade,  -- null = top-level, direct child of the task

  title text not null,
  weight_percent int not null check (weight_percent between 0 and 100),
  is_done boolean not null default false,
  depth int not null check (depth between 1 and 4),
  position int not null default 0,  -- display order within a sibling group

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tm_subtasks_task_id_idx on tm_subtasks(task_id);
create index if not exists tm_subtasks_parent_id_idx on tm_subtasks(parent_id);
