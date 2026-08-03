-- ============================================================================
-- Task Manager — granular "can view all tasks" permission
-- Run this once in the Supabase SQL editor.
-- ============================================================================

-- Lives on the shared `users` table (not a tm_ table) since it's a
-- per-person permission, same pattern as email_verified/email_confirm
-- added earlier. tm_ prefix keeps it clearly scoped to Task Manager,
-- distinct from `role`, which still governs everything else (who can
-- create/edit/archive/delete tasks and projects, send reports, etc.) —
-- this column ONLY affects which tasks someone can see in the read views.
alter table users add column if not exists tm_can_view_all_tasks boolean not null default false;

-- Backfill: admin/manager/super_admin already saw every task before this
-- permission existed (see isSeniorManagement in taskAccessControl.ts) —
-- default them to keeping that, so nothing breaks for anyone currently
-- relying on it. From here on it's just a normal per-user toggle: grant it
-- to a specific employee who needs broader visibility without becoming an
-- admin, or revoke it from an admin/manager who shouldn't have it, via the
-- Users page.
update users
set tm_can_view_all_tasks = true
where role in ('admin', 'manager', 'super_admin') and tm_can_view_all_tasks = false;
