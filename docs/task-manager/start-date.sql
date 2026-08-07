-- ============================================================================
-- Task Manager — start date for tasks
-- Run this once in the Supabase SQL editor, same as the earlier files.
-- ============================================================================

-- Purely informational/planning field — when work is expected to begin,
-- separate from due_date (when it's expected to be done by). Not used in
-- any status/overdue calculation; those still key off due_date only.
alter table tm_tasks add column if not exists start_date date;
