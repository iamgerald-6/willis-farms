-- ============================================================================
-- Task Manager — subtasks gain owner, start date, due date
-- Run this once in the Supabase SQL editor for the Wills Farms project,
-- AFTER subtasks.sql. Purely additive — existing rows just get these three
-- columns as null, which is fine (owner/dates are optional per subtask).
--
-- Client request: every subtask node (leaf or with its own children) can
-- have an owner (anyone with an account — no role restriction, unlike task
-- ownership) and a start/due date. A node's dates are meant to fall within
-- its immediate parent's dates (the task's, for a top-level subtask; the
-- parent subtask's, one level up, for a nested one) — enforced in the API
-- (src/app/api/task-manager/tasks/[id]/subtasks/route.ts), not here, same
-- convention as weight_percent siblings summing to 100.
--
-- Status for subtasks is never stored — like tm_tasks.display_status, it's
-- computed at read time (see src/lib/subtaskProgress.ts): a leaf's status
-- comes from its own dates + is_done, and any node with children gets its
-- status by aggregating its children's statuses. This is a completely
-- separate computation from the existing weighted weight_percent/is_done
-- completion rollup, which is untouched by this migration.
-- ============================================================================

alter table tm_subtasks
  add column if not exists owner_id uuid,     -- references public.users.user_id; no role restriction
  add column if not exists start_date date,
  add column if not exists due_date date;

create index if not exists tm_subtasks_owner_id_idx on tm_subtasks(owner_id);
