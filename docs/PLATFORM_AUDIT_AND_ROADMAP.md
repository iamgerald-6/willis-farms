# Wills Farms Platform — Infrastructure Audit & Roadmap

**Purpose:** Inventory every module, form field, permission, automation, and infrastructure piece. Mark what exists today vs what must move to **system definitions** and the **new permission model**.

**Audience:** Product, engineering, and access-control administrators planning the modular, automated platform.

**Related docs:**
- [ACCESS_CONTROL_SUPABASE.md](./ACCESS_CONTROL_SUPABASE.md) — DB schema for permissions today
- [APPRAISAL_SYSTEM_UPDATE_SUPABASE.md](./APPRAISAL_SYSTEM_UPDATE_SUPABASE.md) — appraisal migrations (archive, reviewers)
- [CAREERS_RECRUITMENT_SUPABASE.md](./CAREERS_RECRUITMENT_SUPABASE.md) — recruitment tables
- [task-manager/SETUP.md](./task-manager/SETUP.md) — Task Manager setup
- [SYSTEM_DEFINITIONS_SPEC.md](./SYSTEM_DEFINITIONS_SPEC.md) — target schema for modular forms & option lists

---

## Table of contents

1. [Vision](#1-vision)
2. [Module registry (IDs)](#2-module-registry-ids)
3. [New permission model](#3-new-permission-model)
4. [Current permission model (today)](#4-current-permission-model-today)
5. [System definitions pattern](#5-system-definitions-pattern)
6. [Infrastructure stack](#6-infrastructure-stack)
7. [Module-by-module audit](#7-module-by-module-audit)
8. [Hardcoded selects — full inventory](#8-hardcoded-selects--full-inventory)
9. [Implementation status summary](#9-implementation-status-summary)
10. [Recommended build order](#10-recommended-build-order)
11. [Known gaps & pending work](#11-known-gaps--pending-work)

---

## 1. Vision

| Today | Target |
|-------|--------|
| Hardcoded selects (leave type, grades, categories) in React files | **System definitions** per module — options the app does not track live live in config/DB |
| Fields retyped manually (supervisor email, job title) | **Auto-populated** from `users`, session, appraisals, org rules |
| Page access + view/add/edit as **one radio** (higher implies lower) | **Five independent checkboxes:** View, Add, Edit, Approve, Review |
| Permissions stored but only enforced on User Management | Permissions **enforced per module** on routes + APIs |
| Invite + set-password only | Full **onboarding** flow after first login |
| Module keys like `hc:leave` | Stable **module IDs** (`mod:leave`) used in permissions, nav, and definitions |

**Design rule:** If the system **tracks** a value (users, grades, supervisors, active appraisal period), populate from API/session. If it does **not** track it (leave types, SOP categories), define it in **system design** until a live policy table exists.

---

## 2. Module registry (IDs)

These IDs are the **target** single source for navigation, permissions, and system definitions. Current permission keys are shown for migration mapping.

| Module ID | Label | Route(s) | Permission key today | Status |
|-----------|-------|----------|----------------------|--------|
| `mod:overview` | Overview | `/dashboard` | `dashboard` | Implemented |
| `mod:users` | User Management | `/dashboard/access-control`, `/dashboard/access-control/[userId]` | `users` | Implemented |
| `mod:notifications` | Notifications | `/dashboard/notifications` | `notifications` | **Stub only** |
| `mod:leave` | Leave | `/dashboard/humanCapital/leave` | `hc:leave` | Implemented |
| `mod:appraisal` | Appraisal | `/dashboard/humanCapital/appraisal`, `.../appraisalForms`, `.../[id]` | `hc:appraisal` | Mostly complete |
| `mod:justifications` | Justifications | `.../appraisal/justifications` | `hc:justifications` | Implemented |
| `mod:skillLog` | Skill Logs | `/dashboard/humanCapital/skillLog` | `hc:skillLog` | Implemented |
| `mod:promotion` | Promotion | `/dashboard/humanCapital/promotion` | `hc:promotion` | Implemented |
| `mod:recruitment` | Recruitment | `/dashboard/humanCapital/recruitment` | `hc:recruitment` | Implemented |
| `mod:sop:view` | SOP (view) | `/dashboard/sop` | `sop:view` | Implemented |
| `mod:sop:manage` | SOP Management | `/dashboard/addSop` | `sop:add` | Implemented |
| `mod:policies` | Policies & Ops | `/dashboard/policies` | `policies` | Implemented |
| `mod:tm:tasks` | Tasks | `/dashboard/taskManager/tasks` | `tm:tasks` | Implemented |
| `mod:tm:calendar` | Calendar / Schedule | `/dashboard/taskManager/calendar` | `tm:calendar` | Implemented |
| `mod:settings` | Settings | `/dashboard/settings` | *(none — any logged-in user)* | Implemented |
| `mod:onboarding` | Onboarding | *(not built)* | *(new)* | **Not built** |
| `mod:auth` | Auth (system) | `/login`, `/forgot-password`, `/set-password`, `/invite-expired` | N/A | Implemented |

**Legacy / missing routes:**
- `/dashboard/users` — redirects to access control
- `/dashboard/humanCapital/schedule` — redirects to calendar
- `/dashboard/lms` — linked from overview but **page missing**

**Source files:**
- Permission keys: `src/lib/pagePermissions.ts`
- Sidebar / nav: `src/components/Sidebar.tsx`, `src/components/ProductTiles.tsx`

---

## 3. New permission model

### 3.1 Actions (independent — checkboxes, not radio)

Each module row in Manage User should expose up to five **independent** toggles. Having one action must **not** grant another.

| Action | Meaning | Must NOT imply |
|--------|---------|----------------|
| **View** | Open module, read lists and detail | Add, Edit, Approve, Review |
| **Add** | Create new records only | View, Edit, Approve, Review |
| **Edit** | Update, delete, archive, disable, upload new version | View, Add, Approve, Review |
| **Approve** | Final decision on workflows (leave approve/reject, justification decision, hire/reject) | View, Add, Edit, Review |
| **Review** | Comment, assess, fill supervisor sections, panel scoring — **not** final approval | View, Add, Edit, Approve |

**Remove today's behavior:** `PermissionMatrix.tsx` uses **radio** with implied hierarchy (Edit ⊃ Add ⊃ View). Tooltips say "Everything in View, plus…" — this must be removed.

### 3.2 Proposed storage shape

Replace `page_permission_levels: { "hc:leave": "edit" }` with:

```ts
page_permission_actions: {
  "mod:leave": {
    view: true,
    add: true,
    edit: false,
    approve: false,
    review: false,
  },
  "mod:appraisal": {
    view: true,
    add: true,
    edit: false,
    approve: false,
    review: true,
  },
}
```

Migration: map legacy levels to actions only for backward compatibility during rollout; do **not** auto-grant implied permissions in the new model.

### 3.3 Which modules need which actions

| Module ID | View | Add | Edit | Approve | Review |
|-----------|:----:|:---:|:----:|:-------:|:------:|
| `mod:overview` | ✓ | — | — | — | — |
| `mod:users` | ✓ | ✓ (invite) | ✓ (manage, disable, matrix) | — | — |
| `mod:leave` | ✓ | ✓ (apply) | — | ✓ (admin approve/reject) | — |
| `mod:appraisal` | ✓ | ✓ (start/submit own) | ✓ (archive — manager/admin) | — | ✓ (supervisor fill, final review) |
| `mod:justifications` | ✓ | ✓ (submit) | — | ✓ (manager decision) | — |
| `mod:skillLog` | ✓ | ✓ (create) | ✓ (edit draft) | — | ✓ (sign-off chain) |
| `mod:promotion` | ✓ | ✓ (assessment) | — | — | ✓ (panel assessment) |
| `mod:recruitment` | ✓ | — | ✓ (status, notes) | ✓ (hire/hold/reject) | ✓ (interview stages) |
| `mod:sop:view` | ✓ | — | — | — | — |
| `mod:sop:manage` | ✓ | ✓ (upload) | ✓ (delete) | — | — |
| `mod:policies` | ✓ | ✓ (upload) | ✓ (delete version) | — | — |
| `mod:tm:tasks` | ✓ | ✓ (task/project) | ✓ (edit/archive/delete) | — | — |
| `mod:tm:calendar` | ✓ | — | ✓ (off-days) | — | — |
| `mod:notifications` | ✓ | — | — | — | — |

**Note:** Role and grade rules (e.g. L5+ sees all appraisals, senior management approves leave) remain as **business rules** layered on top of module permissions — not replaced by them.

---

## 4. Current permission model (today)

### 4.1 How it works now

- **Keys:** `PAGE_PERMISSION_KEYS` in `src/lib/pagePermissions.ts` (14 keys)
- **Levels:** `view` (1) → `add` (2) → `edit` (3) — hierarchical via `LEVEL_RANK` in `src/lib/permissionLevels.ts`
- **UI:** Radio matrix in `src/app/(dashboard)/dashboard/access-control/components/PermissionMatrix.tsx`
- **Storage:** `users.page_permission_levels` (jsonb) + legacy `users.page_permissions` (array)
- **Tiers:** `standard` vs `delegated` on `users.access_tier`

### 4.2 Where permissions are enforced

| Area | Enforced? | How |
|------|-----------|-----|
| Sidebar / route guard | Partial | `canAccessPage()` — page visibility only |
| User Management | **Yes** | `canAddUser`, `canManageUserAccounts`, matrix save |
| Leave | No (matrix) | `requireSeniorManagement` for admin review |
| Appraisal | Partial | Archive requires `hc:appraisal: edit` for admin; grade/role for most |
| SOP / Policies | No (matrix) | Role-based / weak API auth |
| Task Manager | No (matrix) | Senior management + `tm_can_view_all_tasks` flag |

### 4.3 Admin defaults (lighter than manager)

From `ADMIN_DEFAULT_OVERRIDES` in `src/lib/permissionLevels.ts`:
- `users`: view
- `policies`: add
- `sop:view`: view, `sop:add`: add
- `hc:appraisal`: add (no archive unless edit granted)

---

## 5. System definitions pattern

See [SYSTEM_DEFINITIONS_SPEC.md](./SYSTEM_DEFINITIONS_SPEC.md) for the full schema, field types, and migration checklist.

**Existing config-as-code patterns to extend:**
- `src/app/(dashboard)/dashboard/humanCapital/promotion/component/promotionFormConfigs.ts`
- `src/lib/careers/interviewFormConfigs.ts`
- `src/lib/appraisal/sections.ts`
- `src/app/(dashboard)/dashboard/humanCapital/skillLog/skillLogForms/page.tsx` (`LOG_TYPES`)

**Target:** One registry per module with fields, option lists, workflows, attachments, and auto-fill rules. A shared form renderer reads definitions instead of hardcoded JSX selects.

---

## 6. Infrastructure stack

| Layer | Role | Talks to |
|-------|------|----------|
| **Hostinger** | Domain + DNS (SPF/DKIM for email) | Points domain → Vercel |
| **Vercel** | Next.js app, API routes, cron | Supabase, Resend, Anthropic, Cloudinary |
| **Supabase** | Auth + Postgres | — |
| **Resend** | Transactional email (invites, appraisal reminders) | Delivers to users |
| **Anthropic (Claude)** | AI extract + report summary (Task Manager) | Returns JSON/text to Vercel only |
| **Cloudinary** | File storage (SOP, policies, CVs) | URLs stored in Supabase |

### Scheduled jobs (`vercel.json`)

| Schedule (UTC) | Path | Purpose |
|----------------|------|---------|
| `0 6 * * *` | `/api/cron/appraisal-reminders` | Seed appraisals, reminders, lock, penalties |
| `0 9 * * *` | `/api/task-manager/cron/daily` | Task deadline reminders, monthly compliance report |

### Key environment variables

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`, email from-address
- `NEXT_PUBLIC_APP_URL` — required for production email/deep links
- `ANTHROPIC_API_KEY` — Task Manager extraction
- Cloudinary credentials — uploads

---

## 7. Module-by-module audit

### 7.1 Auth (`mod:auth`)

| | |
|--|--|
| **Routes** | `/login`, `/forgot-password`, `/set-password`, `/invite-expired` |
| **Tables** | `users`, Supabase `auth.users` |
| **Status** | **Implemented** |

**Fields**

| Field | Type | Source today | Target |
|-------|------|--------------|--------|
| email | input | manual | definition |
| password / confirm | input | manual | definition |

**Key files:** `src/app/(auth)/`, `src/lib/auth/authLinkClient.ts`, `src/lib/staffAccount.ts`

**Gaps:** Onboarding module after invite; no permission matrix entry (correct).

---

### 7.2 Overview (`mod:overview`)

| | |
|--|--|
| **Route** | `/dashboard` |
| **Status** | **Implemented** (admin vs employee dashboards) |

**Fields:** None (read-only KPIs from `users`, `leave_requests`, `appraisals`, `skill_logs`, `content`).

**Gaps:** Link to `/dashboard/lms` — page missing. Should respect `mod:overview` View only in new model.

---

### 7.3 User Management (`mod:users`)

| | |
|--|--|
| **Routes** | `/dashboard/access-control`, `/dashboard/access-control/[userId]` |
| **Tables** | `users` |
| **Status** | **Implemented** — list, invite, Manage User, PermissionMatrix save |

**Add User modal (`createModal.tsx`)**

| Field | Type | Options today | Target source |
|-------|------|---------------|---------------|
| first_name, last_name | text | manual | definition |
| email | email | manual | definition |
| phone | text | manual | definition |
| company_id | text | manual | auto or manual |
| job_position | text | manual | definition / profile |
| grade_level | select | Hardcoded L1–L7 | `systemDefinition.grades` |
| role | select | Hardcoded employee, manager, admin | `systemDefinition.roles` |

**Manage User page**

| Field | Type | Notes |
|-------|------|-------|
| first_name, last_name | text | editable |
| email | read-only | display |
| is_disabled | checkbox | |
| PermissionMatrix | radio view/add/edit | **→ 5 checkboxes per module ID** |

**APIs:** `/api/create_user`, `/api/access-control`, `/api/access-control/resend-invite`, `/api/access-control/name`

**Gaps**
- Matrix not enforced on HR/SOP/TM APIs
- No UI for `tm_can_view_all_tasks`
- No onboarding completion tracking beyond `email_verified`
- Module IDs + approve/review columns not built

---

### 7.4 Leave (`mod:leave`)

| | |
|--|--|
| **Route** | `/dashboard/humanCapital/leave` |
| **Tables** | `leave_requests` |
| **Status** | **Implemented** — apply, history, admin approve/reject |

**Apply form (`LeavePag.tsx`) — every field**

| Field | Type | Options today | Target |
|-------|------|---------------|--------|
| **leave_type** | select | Hardcoded: Annual, Sick, Emergency, Maternity/Paternity, Unpaid, Other | `systemDefinition.leaveTypes` |
| start_date | date | min today | definition rule |
| end_date | date | min start_date | definition rule |
| reason | textarea | required if type = Other | `requiredWhen` in definition |

**Computed (server):** `total_days`, `user_id`, `status`, `reviewed_by`, `reviewed_at`

**Admin review (`LeaveRequestsAdminPage.tsx`)**

| Field | Type | Permission |
|-------|------|------------|
| admin_note | textarea | optional |
| Approve / Reject | actions | **Approve** (today: senior management role) |

**Access today:** Page = `hc:leave`; approve = role-based, not matrix.

**Gaps:** No email on apply/approve; no file attachment; annual cap hardcoded in API; leave types not in system definitions.

---

### 7.5 Appraisal (`mod:appraisal`)

| | |
|--|--|
| **Routes** | list, `appraisalForms`, `[id]`, justifications |
| **Tables** | `appraisals`, `supervisor_penalties`, `appraisal_justifications` |
| **Status** | **Largely implemented** |

**Key form fields**

| Field | Type | Options today | Target |
|-------|------|---------------|--------|
| Who is this for? | toggle | Myself / Someone I supervise | definition + grade rules |
| grade_band | select/read-only | L1, L2_L3, L4, L5_L6_L7 | `sections.GRADE_OPTIONS` → definition |
| employee | select | API `/get_user` filtered by grade | supervisors-by-grade API |
| review_quarter / year | read-only | Active period (`deadlines.ts`) | definition + cron |
| employee_email | input | profile prefill | auto `session.email` |
| immediate_supervisor | text | manual | auto suggest |
| supervisor_email | email | manual | select eligible supervisors |
| section_authorisations_held | text | manual | optional definition |
| reviewing_manager, period_covered | text | Q4 only | definition |
| Ratings per item | 1–5 + comment | `sections.ts` per grade/quarter | definition (already config-driven) |
| promotion_readiness | radio | 5 hardcoded options | definition |
| Narrative fields | textarea | manual | definition group |
| final_review_date | date | supervisor | definition |

**Permissions today:** Grade/role heavy; archive = manager or admin with `hc:appraisal: edit`.

**Automations:** Daily cron; supervisor email on employee submit; multiple reminder emails via Resend.

**Key files:** `src/lib/appraisal/`, `src/app/api/appraisal/`, `AppraisalDetail.tsx`, `AppraisalPageView.tsx`

**Gaps:** Map supervisor fill → Review; archive → Edit; matrix not fully wired except archive for admin.

**DB migration:** Run section 1a in [APPRAISAL_SYSTEM_UPDATE_SUPABASE.md](./APPRAISAL_SYSTEM_UPDATE_SUPABASE.md) for archive + reviewer columns if not applied.

---

### 7.6 Justifications (`mod:justifications`)

| Field | Type | Notes |
|-------|------|-------|
| reason_text | textarea | submit |
| status | approve/reject | API |
| review_notes | text | |
| points_waived | boolean | |

**Status:** **Implemented**. Approve = `canReviewJustification` (manager/admin/L5+).

---

### 7.7 Skill Logs (`mod:skillLog`)

| Field | Type | Options today |
|-------|------|---------------|
| employee_id | select | API users (grade-filtered) |
| employee_grade | select | Hardcoded L1–L6 |
| log_type | select | Hardcoded 6 `LOG_TYPES` keys (competency trees in TS) |
| review_period, section, tier_auth | text | manual |
| strengths_observed, development_gaps | textarea | |
| Per skill: observed, supervised, consistent, rating 1–5, comments | mixed | LOG_TYPES expansion |
| signoff_stage | enum | observed / supervised / consistent |

**Status:** **Implemented**. **Review** = sign-off chain; **Add** = create log.

**To come:** Move `LOG_TYPES` and grades to system definitions.

---

### 7.8 Promotion (`mod:promotion`)

**Config-driven:** `promotionFormConfigs.ts` — 6 steps (L1→L2 … L6→L7).

| Area | Source |
|------|--------|
| Pending employee | API appraisals with promotion_readiness |
| proposed_job_title, proposed_grade | Hardcoded per step |
| disqualifying factors, evidence, interview Qs | Per-step config |
| final_decision | Hardcoded 5 options |
| sign-off roles | Per-step config |

**Status:** **Implemented** — best template for system definitions elsewhere.

---

### 7.9 Recruitment (`mod:recruitment`)

**Dashboard**

| Field | Options |
|-------|---------|
| status | Hardcoded 6 statuses |
| hr_notes | textarea |
| Interview panel (multi-stage) | `interviewFormConfigs.ts` per role L1–L7 + specialist |
| Panel members, datetime, location | manual |
| Ratings 1–5, disqualifiers, decision hire/hold/do_not_hire | hardcoded enums |

**Public careers apply**

| Field | Options |
|-------|---------|
| role_slug | `ALL_CAREER_OPENINGS` in `openings.ts` |
| full_name, email, phone, location, cover_note | manual |
| CV | file → Cloudinary |

**Status:** **Implemented**. **Approve** ≈ hire decision; **Review** ≈ interview stages.

---

### 7.10 SOP View (`mod:sop:view`) & Manage (`mod:sop:manage`)

**Upload modal (`addContentModal.tsx`) — every field**

| Field | Type | Options today | Target |
|-------|------|---------------|--------|
| title | text | | definition |
| **category** | select | 7 hardcoded categories | `definition.sopCategories` |
| **sub_category** | select | Hardcoded map per category | `definition.sopSubCategories[category]` |
| description | textarea | | |
| document_read_minutes | number | | |
| video_duration_minutes | number | | |
| cover_image, document, video | file | Cloudinary | definition.attachments |

**Browse filters:** same 7 categories.

**Status:** **Implemented**. Delete API auth needs hardening.

---

### 7.11 Policies (`mod:policies`)

| Field | Type | Options |
|-------|------|---------|
| title | text | |
| **category** | select | HR, Biosecurity, Finance Policies, Breeding Operations |
| description | textarea | |
| version_label, version_notes | text | |
| file (PDF) | upload | Cloudinary |

**Status:** **Implemented** UI; API auth gap on create/delete.

---

### 7.12 Task Manager (`mod:tm:tasks`, `mod:tm:calendar`)

**Task register**

| Field | Type | Options |
|-------|------|---------|
| title | text | |
| owner_id | select | API users |
| due_date | date | |
| is_recurring, frequency | checkbox/text | |
| description | text | |

**Monitoring task fields:** indicator, frequency, method_provider

**Automation settings**

| Field | Options |
|-------|---------|
| report day_of_month | Hardcoded 1–28 |
| recipients, cc | email lists |
| reminder days_before_due | number |

**Calendar off-days:** Sun–Sat toggles → `off_days` table

**Claude extraction:** reads docs → `tm_extraction_jobs` → user saves to `tm_tasks`

**Status:** **Implemented** (mature). Access = senior management + `tm_can_view_all_tasks`.

**Gaps:** Permission matrix not enforced; no Manage User UI for view-all-tasks flag.

---

### 7.13 Notifications (`mod:notifications`)

**Status:** **NOT implemented** — placeholder page only.

**To come:** In-app + email notification center tied to module events (leave approved, appraisal due, etc.).

---

### 7.14 Settings (`mod:settings`)

| Field | Editable |
|-------|----------|
| first_name, last_name | yes |
| email, role, grade, job, phone, company_id | read-only |
| password change | Supabase client |

**Status:** **Implemented**. Not in permission matrix (any authenticated user).

---

### 7.15 Onboarding (`mod:onboarding`) — NOT built

**Recommended steps:**
1. Confirm profile (name, phone, job if missing)
2. Acknowledge policies / SOP (optional)
3. Set password if not done (`email_verified`)
4. Redirect to overview when `onboarding_completed_at` set

**Existing API:** `/api/account/complete-onboarding` (partial)

**Tables:** extend `users` or add `user_onboarding` JSON.

---

## 8. Hardcoded selects — full inventory

Every select/input whose options should eventually live in system definitions:

| Domain | Values | Current file |
|--------|--------|--------------|
| Leave types | Annual, Sick, Emergency, Maternity/Paternity, Unpaid, Other | `LeavePag.tsx` |
| Invite role | employee, manager, admin | `createModal.tsx` |
| Invite grade | L1–L7 + labels | `createModal.tsx` |
| Appraisal grade bands | L1, L2_L3, L4, L5_L6_L7 | `sections.ts` |
| Quarters | Q1–Q4 | `sections.ts` |
| Rating 1–5 labels | Unsatisfactory → Excellent | `scoring.ts` |
| Promotion readiness | 5 values | `AppraisalPage.tsx` |
| Promotion final decision | 5 values | `promotionFormConfigs.ts` |
| Skill log types | 6 LOG_TYPES trees | `skillLogForms/page.tsx` |
| Skill grades | L1–L6 | `skillLogForms/page.tsx` |
| SOP categories + subs | 7 + map | `addContentModal.tsx` |
| Policy categories | 4 | `policies/page.tsx`, `uploadModal.tsx` |
| Careers role_slug | openings list | `openings.ts` |
| Application status | 6 | careers types |
| Interview decision | hire, hold, do_not_hire | careers types |
| Interview ratings | 1–5 | `interviewFormConfigs.ts` |
| Task report day | 1–28 | AutomationSettingsModal |
| Leave status | pending, approved, rejected | DB / UI |
| Access tier | standard, delegated | DB constraint |
| User role | employee, manager, admin, super_admin | DB / forms |

---

## 9. Implementation status summary

| Area | Implemented | Partial | Not done |
|------|-------------|---------|----------|
| Auth + invite | ✓ | | Onboarding page |
| Overview | ✓ | LMS link broken | |
| User Management | ✓ list/invite/matrix | Matrix only enforced here | Checkbox permissions; module IDs |
| Leave | ✓ apply/review | | System def leave types; emails |
| Appraisal | ✓ full workflow | Matrix on archive only | Full action enforcement |
| Justifications | ✓ | | |
| Skill logs | ✓ | | Move LOG_TYPES to definitions |
| Promotion | ✓ | | |
| Recruitment | ✓ | | |
| SOP | ✓ | API auth on delete | Categories in definitions |
| Policies | ✓ | API auth | |
| Task Manager | ✓ | tm_can_view_all_tasks UI | Matrix enforcement |
| Notifications | | | Entire module |
| Settings | ✓ | | |
| System definitions layer | Patterns exist | Per-module | Central registry + renderer |
| Auto-populate fields | Some (profile, period) | | Most selects/lookups |
| Permission: Approve/Review | Business rules in code | | Explicit flags + UI |

---

## 10. Recommended build order

1. **Define** `ModuleRegistry` + shared types (`FieldDef`, `PermissionActions`) — see [SYSTEM_DEFINITIONS_SPEC.md](./SYSTEM_DEFINITIONS_SPEC.md)
2. **Refactor PermissionMatrix** → checkboxes for View / Add / Edit / Approve / Review per module ID; update `users` jsonb column + migration SQL
3. **Enforce** permissions in `RouteAccessGuard` + each API route (start with Leave + Appraisal)
4. **Extract** first system definition: **`mod:leave`** (leave types, fields, workflow)
5. **Build onboarding** (`mod:onboarding`) gated before dashboard
6. **Migrate** SOP categories, policy categories, invite grades/roles into definitions
7. **User Management UI** refresh: show module IDs, permission checkboxes, onboarding status
8. **Notifications** module (View-only events from other modules)
9. **Harden** unauthenticated or weak-auth SOP/policy APIs

---

## 11. Known gaps & pending work

### Immediate (ops)

1. Run Supabase migration for **appraisal archive + reviewer columns** if not done — [APPRAISAL_SYSTEM_UPDATE_SUPABASE.md](./APPRAISAL_SYSTEM_UPDATE_SUPABASE.md) section 1a
2. Set `NEXT_PUBLIC_APP_URL` for production email/deep links
3. Verify Resend domain on Hostinger DNS (SPF/DKIM)

### Architecture (product)

1. Unified **system-definition layer** (leave type is the clearest example — still hardcoded in React)
2. **Modular permissions** with independent View / Add / Edit / Approve / Review per **module ID**
3. **Onboarding** and **User Management** refresh aligned with new model
4. **Full enforcement** of stored permissions outside User Management

---

*Last updated: August 2026 — generated from codebase audit of willsfarms-website-codebase-with-leads-inbox.*
