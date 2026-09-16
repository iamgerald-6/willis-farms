# Multi-Site Access Architecture — Design Document

**Status:** Phase 2 (Design) — not yet implemented. Nothing in this document has been built.
**Based on:** Phase 1 audit (this session — see conversation history; not separately filed).

This document classifies every table, defines the access-scope model, and lays out the
authorization flow, migration plan, and test plan for site-based data isolation across
willis-farms. It intentionally does **not** touch code or the database — that's Phase 3,
and only after this design is confirmed.

---

## 1. Core principle

> A user's **role** determines *what* they're allowed to do (view/add/edit/approve/...).
> A user's **site scope** determines *which records* they're allowed to do it to.

These are orthogonal and must be applied together, not as a substitute for each other.
Concretely: every query that currently applies a role-based filter (e.g. "Executive/HR see
all leave requests") must, going forward, apply a **second, independent** site-scope filter
on top of it — not have site-scoping bypass the role logic, and not have role-based "sees
everything" quietly mean "everything, forever, regardless of site" (which is what happens
today, per the Phase 1 audit).

---

## 2. Access scope model

### 2.1 New concept: `access_scope`

A new, explicit column on `users`:

```
access_scope text not null default 'SITE' check (access_scope in ('SITE', 'ALL_SITES'))
```

- **`SITE`** (default, everyone starts here): authorized sites = `[users.site_id]` only.
- **`ALL_SITES`**: authorized sites = every active row in `sites`.
- `MULTI_SITE` (an explicit, named list of authorized sites) is **not** being built in
  Phase 3 — nothing in the Phase 1 audit surfaced a real requirement for "this specific
  person can see exactly these 3 of our 5 sites." `SITE`/`ALL_SITES` covers every case
  found. If that need shows up later, it's a small additive change (a
  `user_site_access(user_id, site_id)` join table + a third enum value) — not a redesign.

This is deliberately **not** derived purely from role, per your explicit instruction. It's
its own column, set per-user, independently adjustable from role. That said, for the
initial backfill (existing users, who have never had a site-scope concept before), the
safest value to assign is the one that preserves *today's actual behavior* with zero
surprise regressions — see §6.1.

**Precedent already in this codebase**: `tm_can_view_all_tasks` on `users` — exactly this
pattern (a role gives a *default*, but an explicit per-user boolean can override it),
already shipped and working for Task Manager. `access_scope` generalizes that same idea
company-wide instead of reinventing something new.

### 2.2 Central authorization helper

New functions in `src/lib/apiRequestAuth.ts` (extending the existing `require*Access`
family, not replacing it):

```ts
// Added to ApiRequestUser:
site_id: number | null;
access_scope: "SITE" | "ALL_SITES";

// New:
async function getAuthorizedSiteIds(user: ApiRequestUser): Promise<number[] | "ALL">
function assertSiteAccess(user: ApiRequestUser, siteId: number | null): boolean
```

- `getAuthorizedSiteIds` returns the sentinel `"ALL"` for `ALL_SITES` scope (so callers can
  skip filtering entirely — cheap, and mirrors the existing `"all"` scope pattern already
  used in `taskManagerScope.ts` / `leaveAccess.ts` / `appraisalAccess.ts`), or `[user.site_id]`
  for `SITE` scope.
- `assertSiteAccess(user, siteId)` is the single-record check used before any update/delete:
  `siteId === null` (record has no resolvable site, e.g. a draft application) is treated as
  **not accessible** to a `SITE`-scoped user by default — a stricter-by-default stance,
  documented per-table below where it applies.
- Every API route that currently does ad hoc role-only filtering gets this as an
  **additional** filter, applied after the existing role-scope logic, not instead of it.

This is the one central mechanism §13 asked for — every module reuses it instead of
reimplementing its own site-check.

---

## 3. Table classification

| Table | Classification | Direct `site_id`? | Inherited from | Why |
|---|---|---|---|---|
| `sites` | — | — (it's the root) | — | — |
| `business_units`, `departments`, `sections`, `grade_levels` | D — Org master | No | — | Shared catalogs — the same "Livestock Operations" business unit can exist under multiple sites. Site-specificity is expressed by the *mapping* (§3.1 below), not by the catalog row itself. |
| `org_custom_list_types`, `custom_<slug>` | D — Org master | No | — | Same reasoning — admin-defined catalogs, not per-site data. |
| `org_mapping_levels`, `org_mapping_nodes`, `org_map_<list>` | D — Org mapping | Yes (already, where Site is in the chain) | — | This **is** the existing, correct mechanism for "which BU/Dept/Section is valid under Site X" — see §3.1. No change needed; reuse it, don't duplicate it. |
| `users` | A — Direct | Yes (already exists) | — | Employee's home site. Also gets the new `access_scope` column (§2.1). |
| `job_postings` | A — Direct | Yes (already exists) | — | A posting is inherently for one site; already required at creation via a real dropdown. |
| `job_applications` | B — Inherited | No | `job_postings.site_id` via `job_posting_id` | Confirmed by audit: never stores site directly, always one hop from `job_postings`. **Caveat**: `job_posting_id` is nullable (draft-flow gap) — see §3.2. |
| `onboarding_tokens`, `onboarding_submissions`, `referee_reference_tokens`, `referee_reference_submissions` | B — Inherited | No | `job_applications.application_id` → `job_postings.site_id` (2 hops) | All four have `application_id not null` — chain is unbroken once an application resolves its posting. |
| `role_interview_reports` | C — Effectively global | No | (loosely `job_posting_id`, nullable) | This is interview-guide *content* for a role, not personal/site data — restricting it by site would block legitimate cross-site reuse of an interview guide with no real security benefit. Treated as global. |
| `tm_projects` | **C — Global (see §3.3)** | **No** | — | Audit found no site field, no site UI, and project naming/structure (compliance/monitoring themes) doesn't map 1:1 to a site. Flagged as a judgment call, not a certainty — see §3.3. |
| `tm_tasks`, `tm_subtasks` | B (follows `tm_projects`) | No | `tm_projects` | Once projects are global, tasks/subtasks are global too — no change needed. If §3.3 is decided the other way, this becomes inherited from `tm_projects.site_id` instead. |
| `leave_requests` | **A — Direct (snapshot)** | **Yes (new)** | — | See §3.4 — historical-integrity requirement, not simple inheritance. |
| `appraisals` | **A — Direct (snapshot)** | **Yes (new)** | — | See §3.4 — this is the case your spec called out explicitly (§7). |
| `appraisal_justifications`, `supervisor_penalties` | B — Inherited | No | `appraisals.site_id` (once added) | Both are always created from an existing appraisal record; once `appraisals` has its own snapshot, these correctly inherit it — no reason to duplicate. |
| `appraisal_grade_templates`, `skill_log_templates` | A — Direct (unchanged) | Yes (already exists) | — | These are **configuration**, not instance data — already correctly site-scoped as part of their composite key. No change. |
| `skill_logs` | **A — Direct (snapshot)** | **Yes (new)** | — | Same reasoning as appraisals — see §3.4. |
| `skill_log_competencies` | B — Inherited | No | `skill_logs.skill_log_id` | Always created alongside a parent skill log; no independent site identity. |
| `promotions` | **A — Direct (snapshot)** | **Yes (new)** | — | Same reasoning as appraisals — see §3.4. |
| `system_modules`, `system_options`, `access_group_presets`, `access_control_items`, `access_control_item_actions` | C — Global | No | — | Company-wide configuration; confirmed no per-site variant exists or is implied anywhere. |
| `content` (SOP), `sop_audit_log` | C — Global | No | — | SOPs are company policy/procedure documents — confirmed nothing in the audit suggests site-specific SOPs exist as a concept. |
| `user_manual_versions` | C — Global | No | — | Single company-wide manual. |
| `tm_report_schedule`, `tm_reminder_settings`, `tm_reminder_log`, `tm_extraction_jobs`, `tm_monthly_reports`, `tm_task_audit_log`, `tm_project_audit_log`, `tm_project_deletions` | C — Global (follows `tm_projects`) | No | `tm_projects` (conceptually) | Task Manager support tables — global for the same reason `tm_projects` is. |

### 3.1 Reuse, don't duplicate: the org-mapping system already solves "site validity"

`org_map_<list>` + `org_mapping_levels` already correctly model "this Business Unit is
valid under this Site." **Do not** add `site_id` to `business_units`/`departments`/etc.
themselves — that would either be redundant (if a BU only ever belongs to one site) or
wrong (if the same BU label is legitimately shared across sites, which the current
many-to-many mapping design explicitly supports). The existing
`itemsForOrgMapField()` filter function (found in Phase 1 audit,
`src/lib/organizationalStructureMapping.ts`) is the right mechanism for cascading-dropdown
validity — it just needs to keep working as-is. No change proposed here.

### 3.2 Resolved: `job_applications.job_posting_id` is now required going forward

The Phase 1 audit flagged this: if an application can exist in application code without a
resolved `job_posting_id` (e.g. mid-draft), it has no resolvable site. **Decision (confirmed
during Phase 3): block the gap at the source going forward.** Existing null rows are
accepted as old/legacy data and deliberately left untouched (no backfill) —
`docs/multi-site/require-job-posting-id-going-forward.sql` adds a `CHECK (job_posting_id is
not null) NOT VALID` constraint, which Postgres enforces on every new insert/update without
validating (or breaking on) rows that already exist. Confirmed via code read that the
current application-save flow (`src/app/api/careers/applications/save/route.ts`) already
always sets `job_posting_id` at creation — this constraint is a database-level backstop for
that, not a fix to a currently-broken path. Any surviving legacy null rows still need the
`SITE`-scoped-users-can't-see-them handling from `assertSiteAccess`'s null-handling
(§2 above) once that's built — they just can't be created anymore.

### 3.3 Judgment call: `tm_projects` — recommending Global, want your confirmation

The audit found zero evidence tying projects to a site — no field, no UI, and the two
real examples found ("Fire Service Compliance," environmental-monitoring indicators like
"Air Quality") read as company-wide regulatory/compliance themes rather than
per-site operations. Per your instruction ("do not add `site_id` simply because a record
happens to be created by a user from a site" / "unless there is a documented reason") the
audit did not find a documented reason, so the design defaults to **not** adding it.

**However** — if in practice each site actually runs its own separate set of obligations/
projects (e.g. Nsawam and Prampram each have their own "Fire Service Compliance" project
tracked separately), that would justify `tm_projects.site_id` after all. This is a business
fact I can't determine from code alone — **please confirm which is true** before Phase 3,
since it changes whether Task Manager needs any schema change at all.

### 3.4 The historical-snapshot principle (appraisals, leave, skill logs, promotions)

This is the most important design decision in this document, so it's worth stating plainly.

**The problem** (confirmed by audit, not hypothetical): none of these four tables store
site anywhere today. `appraisal_grade_templates` matching works by reading the employee's
**current** `users.site_id` live, at the moment a form is opened — not a stored attribute
of the appraisal record itself. If an employee transfers from Nsawam to Prampram, every
historical appraisal, leave request, skill log, and promotion record they've ever had would
silently read as "Prampram's" the moment anyone joins back through `users.site_id` — because
there is currently no other source of truth. Your spec explicitly called this out (§7, §29)
as something that must not happen silently.

**The fix**: each of these four tables gets its own `site_id integer references sites(id)`,
**populated once at record-creation time** (a snapshot of `users.site_id` as it was *then*,
not a live join), and never updated afterward. This preserves exactly what the record
meant when it was created, independent of any later transfer. Going forward:
- **Leave applications** capture the applicant's site at submission.
- **Appraisals** capture the employee's site at submission (already implicitly true via the
  template-matching org placement at fill-time — this makes it an explicit, durable fact on
  the record instead of a transient lookup key).
- **Skill logs** capture the employee's site at submission, same reasoning.
- **Promotions** capture the employee's site at submission.

`appraisal_justifications` and `supervisor_penalties` don't need their own column — they
inherit `appraisals.site_id` through the parent record, which is now itself a durable
snapshot, so inheritance is safe and correct here (unlike the four tables above, where
inheriting from `users.site_id` directly would reintroduce the exact transfer bug this
section exists to fix).

---

## 4. Query enforcement pattern

Every list/read endpoint gets a **second, independent filter** added after existing
role-scope logic, using `getAuthorizedSiteIds()`:

```ts
const authorizedSites = await getAuthorizedSiteIds(user);
let query = supabaseAdmin.from("appraisals").select("*");
// ...existing role-scope filter stays exactly as it is today...
if (authorizedSites !== "ALL") {
  query = query.in("site_id", authorizedSites);
}
```

For **inherited** tables (no `site_id` of their own — e.g. `job_applications`), the
pattern mirrors what `taskManagerScope.ts` already does for the supervisor-chain case
(resolve an eligible id set first, then filter children by it):

```ts
const authorizedSites = await getAuthorizedSiteIds(user);
let postingIds: string[] | null = null;
if (authorizedSites !== "ALL") {
  const { data } = await supabaseAdmin.from("job_postings").select("id").in("site_id", authorizedSites);
  postingIds = (data ?? []).map(r => r.id);
}
let query = supabaseAdmin.from("job_applications").select("*");
if (postingIds) query = query.in("job_posting_id", postingIds);
```

This is the same shape as the existing `applyTaskListVisibilityFilter()` — deliberately,
so the codebase gains one consistent pattern for "scope → eligible id set → query filter"
instead of a second, differently-shaped mechanism living next to the first.

### 4.1 Create / Update / Delete

- **Create**: `SITE`-scoped users never choose a site — it's derived from `user.site_id`
  and written server-side, ignoring any `site_id`/`job_posting_id`-implying-a-different-site
  the client might send. `ALL_SITES`-scoped users may choose (e.g. HR creating a job posting
  for a specific site) — the chosen site is still validated against real `sites` rows, just
  not restricted to one.
- **Update/Delete**: fetch the existing record first, resolve its site (direct column or,
  for inherited tables, one join up), call `assertSiteAccess(user, recordSite)` — reject
  before mutating if it fails. This mirrors the existing "fetch task, check
  `created_by`/`owner_id`, then act" pattern already used throughout Task Manager and
  Appraisal — same shape, new dimension.
- **Never trust `body.site_id` or `?site_id=` as authorization** — only ever as a
  *requested* value, checked against the server-derived authorized set.

### 4.2 Reports / dashboards / exports

Per the audit, there are no CSV/Excel exports in this app today — only single-record PDFs
(unaffected — a PDF for one offer letter/interview report is already scoped to one record)
and one company-wide Task Manager monthly PDF report (`sendMonthlyReport.tsx`) and the main
dashboard's KPI aggregates. Both need the same `getAuthorizedSiteIds()` filter applied to
their underlying queries before aggregating/rendering — same mechanism, no new pattern.

---

## 5. Two gaps found that are bigger than site-scoping

Flagging per your request last time — these came up during the audit and need a decision,
since they're real exposure independent of whether we build site-scoping at all:

1. **Recruitment API has almost no server-side auth at all** — nearly every route under
   `src/app/api/careers/**` (postings, applications, onboarding, references) has zero role
   check, not just zero site check. Anyone who can reach these endpoints today sees/edits
   everything.
2. **`promotions`' two GET routes have zero auth of any kind** — same issue, isolated to
   that one module.

**Recommendation**: fix both as part of Phase 3, since site-scoping has to touch these
exact routes anyway (they're getting a new filter regardless) — doing the role-auth fix in
the same pass is barely extra work, and shipping site-filtering on top of a completely
unauthenticated route would be nearly meaningless. Confirm you want this folded in, or want
it tracked as a separate follow-up.

---

## 6. Migration plan

All migrations follow the existing repo convention (checked-in SQL under `docs/`, run
manually in the Supabase SQL editor) — no new tooling introduced.

### 6.1 `users.access_scope` — additive, zero-regression backfill

```sql
alter table users add column if not exists access_scope text not null default 'SITE'
  check (access_scope in ('SITE', 'ALL_SITES'));

-- Preserve today's actual behavior: every role that currently has unfiltered,
-- company-wide access in the existing role-only logic (Executive Role, Human
-- Resource, Super Admin — i.e. hasBroadElevatedAccessByRoleLabel) gets ALL_SITES
-- so this migration introduces zero behavior change on day one. Site-scoping
-- only starts taking effect once Phase 3's query changes ship; from that point,
-- access_scope becomes independently adjustable per user, decoupled from role.
update users set access_scope = 'ALL_SITES'
where user_role_id in (
  -- resolved dynamically against whichever custom list table is registered as "User role"
  -- REVIEW REQUIRED at implementation time: exact query depends on resolving the same
  -- role-label logic userRoleAccessControl.ts already uses, not hardcoded here.
);
```

**Documented conflict (per §32)**: this backfill makes an assumption — that "currently has
unfiltered access in the app's role logic" is an acceptable stand-in for "should default to
ALL_SITES." That's almost certainly correct (it's literally preserving current behavior),
but it does mean every Executive/HR/Super Admin account starts as ALL_SITES without
individual review. If any of those accounts should actually be site-restricted, that's a
manual `access_scope` change after migration, not something the migration can know.

### 6.2 New `site_id` columns — `leave_requests`, `appraisals`, `skill_logs`, `promotions`

```sql
alter table leave_requests add column if not exists site_id integer references sites(id);
alter table appraisals add column if not exists site_id integer references sites(id);
alter table skill_logs add column if not exists site_id integer references sites(id);
alter table promotions add column if not exists site_id integer references sites(id);
```

Nullable initially (existing rows need backfilling — not-null is added only after backfill
succeeds, per §21/§23).

**Documented conflict (per §22, §32) — this is the one to stop and discuss, not decide
silently**: for *existing* rows, there is no stored "site at time of creation" anywhere —
the only available source is each employee's **current** `users.site_id`, via
`employee_user_id`/`user_id`/`submitted_by_user_id`. Backfilling from current site is the
only option available, but it means any employee who has ever transferred will have their
*pre-transfer* historical records backfilled with their *new* site — exactly the inaccuracy
this whole design exists to prevent going forward. There is no way to recover the true
historical value; it was never recorded.

**Recommended handling**: backfill from current `users.site_id` (best available data,
better than leaving it null), but first run a report identifying every employee whose
`users.updated_at`-style transfer history (if trackable) suggests they've moved sites, so
you know which historical rows are backfilled with a best-guess rather than a hard fact —
and can decide whether those specific ones need manual correction or an asterisk in
reporting. I have not run this report yet — it's a Phase 3 step, flagged here so it isn't
a surprise.

### 6.3 Recommended rollout order

1. `users.access_scope` (§6.1) — foundational, everything else depends on it.
2. `getAuthorizedSiteIds`/`assertSiteAccess` helpers in `apiRequestAuth.ts` — code only, no
   schema change, can be built and tested independently.
3. Recruitment routes — apply site filtering **and** fix the missing auth (§5.1) together.
4. `promotions` — fix missing auth (§5.2) **and** add `site_id` + filtering together.
5. `leave_requests`, `appraisals`, `skill_logs` — add `site_id`, backfill, apply filtering.
6. Dashboard/reports — apply the same filter to aggregate queries.
7. Frontend — site-scope-aware UI (Section 25 of your spec): show the user's own scope,
   only offer a site picker where `ALL_SITES` actually permits one, filtered lists.

Each step ships independently and is testable on its own — no big-bang cutover.

---

## 7. Testing plan (Phase 4)

Matches §28-29 of your spec exactly:

- **Site A user**: can read/create/update within Site A; cannot read/create/update/delete
  Site B records, including via direct record ID (not just list-hiding).
- **Site B user**: same, reversed.
- **ALL_SITES user**: can access records across sites, still subject to normal role
  restrictions (e.g. an ALL_SITES Standard Role user still can't approve leave — role gate
  unchanged).
- **Client-supplied site tampering**: `?site_id=`/`body.site_id` set to an unauthorized site
  is rejected server-side regardless of what the UI would normally send.
- **Direct-ID cross-site access**: a Site A user given a Site B record's raw ID directly
  (bypassing any list/search) still can't read/update/delete it.
- **Reports/exports/dashboards**: aggregate counts and the Task Manager monthly PDF respect
  scope — a Site A user's dashboard shows Site A numbers only (unless `ALL_SITES`).
- **Employee transfer**: an employee's historical appraisal/leave/skill-log/promotion
  records keep their original `site_id` snapshot after `users.site_id` changes — verified by
  changing a test user's site and confirming old records' `site_id` is untouched.

---

## 8. Open questions before Phase 3 (please confirm)

1. **`tm_projects`** — global (as designed) or actually per-site in practice? (§3.3)
2. **`job_applications.job_posting_id`** — okay to leave nullable with "no site = hidden
   from SITE-scoped users" as the rule, or should it become required? (§3.2)
3. **Fold in the two non-site auth gaps** (recruitment's missing auth, `promotions`' open
   GET routes) as part of this work, or track separately? (§5)
4. **Historical backfill** — comfortable backfilling `appraisals`/`leave_requests`/
   `skill_logs`/`promotions`.`site_id` from employees' *current* site (best available,
   known-imperfect for anyone who's transferred), or do you want a transfer-history report
   run first so you can review before backfilling? (§6.2)

Once these are answered, Phase 3 (implementation) starts with §6.3's rollout order.
