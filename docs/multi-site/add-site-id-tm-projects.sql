-- ============================================================================
-- Site-scoping for Task Manager projects
-- Phase 3 follow-up to the multi-site access architecture — see
-- docs/SITE_ACCESS_ARCHITECTURE.md §6.3 item 7. Run ONCE in the Supabase
-- SQL editor, then reload the schema cache (last line).
--
-- WHY: Task Manager was originally audited as having no site field and no
-- site UI (§3.3 of the architecture doc) and left global/unscoped on that
-- basis. That was later revisited and confirmed: Task Manager should be
-- site-locked the same way Leave/Appraisals/Skill Logs/Promotions/Policies/
-- SOPs are — including for Executive Role, Human Resource, and Super Admin,
-- who currently see every project company-wide and will now only see their
-- own site's projects unless placed at headquarters.
--
-- tm_tasks does NOT get its own site_id — a task's site is always its
-- parent project's site_id (via project_id), so there's nothing to
-- duplicate or let drift out of sync.
--
-- BACKFILL DECISION: every existing project is left with site_id = null.
-- Unlike an employee's leave/appraisal/skill-log/promotion record — which
-- has one true owner whose current site is at least a reasonable guess —
-- a project has no such "whose site is this" signal to guess from, and
-- guessing wrong would silently hide a project from people who already had
-- it open. null is treated as "visible to everyone" (see
-- isProjectSiteVisible in src/lib/taskManagerScope.ts), the same convention
-- already used for untagged Policies/SOPs — so nothing that's visible today
-- becomes invisible. Only NEW projects get a site_id, snapshotted from
-- their creator's site at creation time.
-- ============================================================================

alter table tm_projects add column if not exists site_id integer references sites(id);

-- The deletion tombstone (tm_project_deletions) deliberately has no FK to
-- tm_projects — it's meant to survive the project being gone — so its own
-- site_id is captured at the moment of deletion rather than looked up
-- later, the same way project_name already is.
alter table tm_project_deletions add column if not exists site_id integer references sites(id);

notify pgrst, 'reload schema';

-- After running: no further action needed. Existing projects keep
-- site_id = null (visible to everyone, as above). Every project created
-- from now on is automatically tagged with its creator's current site
-- (see POST /api/task-manager/projects) — there's no separate tagging step
-- to run, unlike Policies/SOPs which support multi-site tagging.
