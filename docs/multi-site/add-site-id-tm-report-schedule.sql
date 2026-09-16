-- ============================================================================
-- Per-site monthly Task Manager reports
-- Phase 3 follow-up to the Task Manager site-scoping change — see
-- docs/multi-site/add-site-id-tm-projects.sql and
-- docs/SITE_ACCESS_ARCHITECTURE.md §6.3 item 7. Run ONCE in the Supabase SQL
-- editor, then reload the schema cache (last line).
--
-- WHY: now that tm_projects carries a site_id, the single company-wide
-- monthly report (one schedule, one recipients list, covering every
-- project) would either leak every site's data to every recipient or hide
-- other sites' data from a report meant to be company-wide. The fix is to
-- let tm_report_schedule hold MULTIPLE rows — one per site, each with its
-- own day-of-month/recipients/enabled flag, generating a PDF scoped to just
-- that site's projects (plus any untagged/company-wide project, same
-- "untagged = visible everywhere" convention already used for Policies/
-- SOPs and tm_projects itself) — PLUS an optional company-wide row
-- (site_id null) that keeps sending the old unfiltered, every-project
-- report, for headquarters/board use.
--
-- tm_report_schedule was previously enforced as a singleton by application
-- logic (see the old "REVIEW REQUIRED" comment in
-- docs/current_database_schema.sql) — that constraint is dropped here in
-- favour of "at most one row per site_id value, including at most one row
-- with site_id null."
--
-- BACKFILL: the existing schedule row is left exactly as-is (site_id stays
-- null), so it keeps behaving as the company-wide report it always was —
-- nothing that was already scheduled changes behavior from this migration
-- alone. Site-specific schedules are opt-in: a headquarters user creates one
-- per site from the Automation settings screen when they want one.
-- ============================================================================

alter table tm_report_schedule add column if not exists site_id integer references sites(id);

-- Postgres unique indexes treat every null as distinct by default, which
-- would let multiple company-wide (site_id null) rows exist — the coalesce
-- trick collapses all nulls onto one sentinel value so at most one
-- company-wide row is allowed, same as before this migration.
create unique index if not exists tm_report_schedule_site_id_uidx
  on tm_report_schedule (coalesce(site_id, -1));

-- Sent-report history also needs to record which site (if any) a given
-- report run was scoped to, so past reports stay distinguishable in the
-- history drawer once multiple schedules exist side by side.
alter table tm_monthly_reports add column if not exists site_id integer references sites(id);

notify pgrst, 'reload schema';

-- After running: no further action needed for existing behavior. To add a
-- per-site schedule, a headquarters user opens Automation settings in Task
-- Manager, picks a site, and saves — this creates a new tm_report_schedule
-- row for that site_id via the (now per-site) PUT /api/task-manager/
-- reports/schedule endpoint.
