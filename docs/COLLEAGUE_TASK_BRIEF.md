# Colleague Task Brief — UI & Form Automation

**Project:** Wills Farms dashboard (WillsOne)  
**Prepared for:** Engineering colleague (UI + form automation)  
**Scope:** Four tasks only — do not expand beyond this brief without checking in first.

**Background docs (read first):**
- [PLATFORM_AUDIT_AND_ROADMAP.md](./PLATFORM_AUDIT_AND_ROADMAP.md) — full module inventory
- [SYSTEM_DEFINITIONS_SPEC.md](./SYSTEM_DEFINITIONS_SPEC.md) — long-term form automation pattern

---

## Summary

| # | Task | Priority | Est. complexity |
|---|------|----------|-----------------|
| 1 | Auto-fill form fields from data the system already tracks | High | Medium–Large |
| 2 | Mask email on password reset / set-password screens | High | Small |
| 3 | Skill Logs list: card layout → tabular (table) layout | Medium | Medium |
| 4 | Merge SOP Management into SOP page as a tab; remove sidebar entry | Medium | Medium |

**Order suggested:** Task 2 (quick win) → Task 3 → Task 4 → Task 1 (largest).

---

## Task 1 — Automate form filling (system-tracked fields)

### Goal

Stop asking users to retype information the app already knows. Pre-fill and/or lock fields that come from the logged-in user, employee records, or active business rules.

**Important:** This task is **not** about moving hardcoded option lists (e.g. leave types) into config yet — that is a separate roadmap item. Focus on **tracked data**: session, `users` table, APIs already in use.

### Design rule

| Source | Example | UI behaviour |
|--------|---------|--------------|
| Session / current user | email, name, user_id, grade | Pre-fill; read-only where identity must not change |
| Selected employee (`/api/get_user`) | job title, grade, company_id | Pre-fill when employee is picked |
| Active period service | appraisal quarter/year | Pre-fill; read-only (already partially done) |
| Supervisor lookup | name + email of eligible supervisor | Pre-fill or dropdown from filtered users |

### Forms to update (priority order)

#### 1a. Appraisal form (highest impact)

**File:** `src/app/(dashboard)/dashboard/humanCapital/appraisal/component/AppraisalPage.tsx`

**Already partially done:**
- `employee_email` pre-fills for self-appraisal via `setValue("employee_email", currentUserProfile.email)` (~line 554)

**Still manual / incomplete — fix these:**

| Field | Current | Target |
|-------|---------|--------|
| `employee_email` | Manual input for supervisor flow | When employee selected, set from `selectedEmployee.email` |
| `immediate_supervisor` | Manual text | Self: suggest from org rules or leave editable; For others: pre-fill viewer's name when viewer is supervisor |
| `supervisor_email` | Manual email | Pre-fill viewer email in supervisor mode; or select from users with grade > employee |
| `review_year` | Partially locked | Keep tied to `getActiveAppraisalPeriod()` from `src/lib/appraisal/deadlines.ts` |
| Employee identity | Select only | Also show read-only job title / grade from selected user |

**Reference:** `src/lib/appraisal/roles.ts` for who can supervise whom.

---

#### 1b. Skill Log form

**File:** `src/app/(dashboard)/dashboard/humanCapital/skillLog/skillLogForms/page.tsx`

**Already done:**
- Supervisor derived from session (`supervisorId`)
- Employee list filtered by grade

**Improve:**
| Field | Target |
|-------|--------|
| `review_period` | Default to current quarter/year string (same pattern as appraisal) |
| Supervisor display | Show read-only supervisor name + grade at top (from `supervisor` object) |
| `employee_id` | When only one employee matches grade, optional auto-select |

---

#### 1c. Leave application

**File:** `src/app/(dashboard)/dashboard/humanCapital/leave/components/LeavePag.tsx`

**Improve:**
| Field | Target |
|-------|--------|
| Employee identity | Hidden/auto — always `session.user.id` (already sent on submit; no need to show picker) |
| Display name | Optional read-only banner: "Applying as {first_name} {last_name}" from `/api/me` or user list |

---

#### 1d. Task Manager (if time permits)

**Files:** Task register modals under `src/app/(dashboard)/dashboard/taskManager/`

| Field | Target |
|-------|--------|
| `owner_id` | Default to current user when creating a task for yourself |

---

### Implementation notes

- Prefer **`useEffect` + `setValue`** (react-hook-form) or **`defaultValues`** from fetched profile — same pattern as appraisal.
- Use existing **`/api/get_user`** and **`/api/me`** — do not add new endpoints unless necessary.
- Pre-filled identity fields should be **read-only** (disabled input or plain text), not hidden, so users can verify what is being submitted.
- Do **not** change API validation logic unless a field becomes server-derived; coordinate if you remove a field from the POST body.

### Acceptance criteria

- [ ] Self-appraisal: employee email and name populated without typing
- [ ] Supervisor appraisal: selecting an employee fills employee email; supervisor fields default sensibly
- [ ] Skill log create: supervisor info visible; review period has a sensible default
- [ ] Leave apply: user sees who they are applying as (no redundant manual identity fields)
- [ ] No regressions on edit flows (appraisal second pass, skill log `?edit=`)

### Out of scope for this task

- Moving `LEAVE_TYPES`, `LOG_TYPES`, SOP categories into system definitions
- Permission matrix changes
- New onboarding page

---

## Task 2 — Mask email on password reset screens

### Goal

Do not display the user's **full email address** on auth screens after reset/setup. Show a masked version so the user knows mail was sent without exposing the complete address (shoulder surfing / screenshots).

### Screens to update

#### 2a. Forgot password — success state

**File:** `src/app/(auth)/forgot-password/page.tsx`

**Current (lines 65–69):** Shows full email from `getValues("email")`.

**Change to:** Masked email, e.g. `g***@willsfarms.com` or `ger***@***.com`.

#### 2b. Set / reset password — account banner

**File:** `src/app/(auth)/components/setPassword.tsx`

**Current (lines 221–228):** Shows full `accountEmail` in "Setting the password for" banner.

**Change to:** Same masking helper; full email must not appear in DOM.

### Masking helper (suggested)

Create a small util, e.g. `src/lib/maskEmail.ts`:

```ts
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const localMasked =
    local.length <= 1
      ? "*"
      : local.length <= 3
        ? `${local[0]}***`
        : `${local.slice(0, 2)}***${local.slice(-1)}`;
  const domainParts = domain.split(".");
  const domainMasked =
    domainParts.length >= 2
      ? `***.${domainParts.slice(-2).join(".")}`
      : "***";
  return `${localMasked}@${domainMasked}`;
}
```

Adjust style to match product preference; keep consistent across both screens.

### Acceptance criteria

- [ ] Forgot password success message uses masked email only
- [ ] Set/reset password banner uses masked email only
- [ ] Invalid/empty email still handled safely
- [ ] Login and form submit still use full email server-side (masking is display-only)

---

## Task 3 — Skill Logs: tabular list instead of cards

### Goal

Replace the card stack on the Skill Logs **list page** with a **table** layout (desktop), matching the pattern used on Appraisal list. Keep mobile usable (cards OK on small screens if needed).

### File to change

**Primary:** `src/app/(dashboard)/dashboard/humanCapital/skillLog/page.tsx`

**Current:** `LogCard` component (~lines 126–255) rendered in a vertical `space-y-3` list (~lines 596–668).

### Reference implementation

**Copy patterns from:** `src/app/(dashboard)/dashboard/humanCapital/appraisal/component/AppraisalPageView.tsx`

- Desktop: `<table>` inside `hidden md:block overflow-x-auto bg-white rounded-2xl border`
- Mobile: optional card stack in `md:hidden` (Appraisal uses cards on mobile + table on desktop)

### Suggested table columns

| Column | Source field |
|--------|----------------|
| Log type | `log.log_type` |
| Employee | `log.employee_name` |
| Grade | `log.employee_grade` |
| Review period | `log.review_period` |
| Filled by | `log.supervisor_name` |
| Rating | `log.overall_rating` (or —) |
| Status | `log.status` (badge: Draft / Pending / Signed Off) |
| Actions | Edit (draft), Sign off, Delete — same rules as today |

### Behaviour to preserve

- Search and status filter pills (top of page) — unchanged
- Stats cards (Total, Signed Off, Pending, Drafts) — unchanged
- Sign-off modal — unchanged
- Delete confirmation — can be inline row action or small modal
- Draft click → navigate to `skillLogForms?edit=`
- Permission rules: `canAct`, `canSignOff`, supervisor vs viewer — **no logic changes**, layout only

### Acceptance criteria

- [ ] Desktop shows sortable-looking table (sorting optional, not required)
- [ ] All existing actions still work (edit, delete, sign off)
- [ ] Mobile remains usable (table scroll or card fallback)
- [ ] Empty and loading states styled consistently with Appraisal list

---

## Task 4 — SOP Management as tab inside SOP (remove sidebar item)

### Goal

Users with SOP upload/manage rights should manage content **inside** the SOP page, not via a separate sidebar link. After the tab works, **remove "SOP Management"** from the sidebar.

### Current state

| Item | Route | Permission key |
|------|-------|----------------|
| SOP (browse) | `/dashboard/sop` | `sop:view` |
| SOP Management | `/dashboard/addSop` | `sop:add` |

**Sidebar:** `src/components/Sidebar.tsx` lines 135–146 — two separate nav items.

**Upload UI:** `src/app/(dashboard)/dashboard/addSop/page.tsx` + `src/app/(dashboard)/dashboard/components/addContentModal.tsx`

### Target UX

```
/dashboard/sop
├── Tab: "Browse"     → current SOP grid (all users with sop:view)
└── Tab: "Manage"     → current addSop management UI (only if user has sop:add or edit level)
```

### Permission gating (use existing helpers — do not invent new rules)

**Files:**
- `src/lib/permissionLevels.ts` — `canAddOnPage`, `canEditOnPage`, `getPagePermissionLevel`
- `src/lib/pagePermissions.ts` — keys `sop:view`, `sop:add`

**Rules:**
- **Browse tab:** visible if user can access SOP view (`sop:view` or full role)
- **Manage tab:** visible only if `canAddOnPage(profile, "sop:add")` OR `canEditOnPage(profile, "sop:add")` OR manager/admin/super_admin full access
- Users with only `sop:view` never see Manage tab

### Implementation steps

1. **Add tab shell to** `src/app/(dashboard)/dashboard/sop/page.tsx`
   - State or URL query: `?tab=browse` | `?tab=manage` (query param preferred — shareable/bookmarkable)
2. **Extract** management content from `addSop/page.tsx` into a reusable component, e.g. `src/app/(dashboard)/dashboard/sop/components/SopManageTab.tsx`
   - Move list, delete, AddContentModal trigger from addSop page
3. **Render Manage tab** only when permission check passes
4. **Redirect legacy route:** `/dashboard/addSop` → `/dashboard/sop?tab=manage` (Next.js redirect in page or middleware) so old links keep working
5. **Remove sidebar entry** "SOP Management" from `src/components/Sidebar.tsx`
6. **Update navbar titles** in `src/components/NavbarDashboard.tsx` — remove or redirect `/dashboard/addSop` entry (~line 96)
7. **Update** `pageKeyFromPath` in `pagePermissions.ts` if needed so `/dashboard/sop?tab=manage` still maps to `sop:add` for route guard OR guard Manage actions inside the tab component only

### Route guard note

`RouteAccessGuard` uses pathname only today. Options:
- **Simple:** Keep `/dashboard/sop` gated by `sop:view`; inside page, hide Manage tab unless `sop:add`
- **Stricter:** Treat `tab=manage` as requiring `sop:add` and redirect to browse if missing

Prefer **stricter** for Manage tab content.

### Acceptance criteria

- [ ] Single "SOP" item in sidebar
- [ ] Browse tab matches current `/dashboard/sop` experience
- [ ] Manage tab matches current `/dashboard/addSop` (upload, list, delete)
- [ ] Manage tab hidden for view-only users
- [ ] `/dashboard/addSop` redirects to `/dashboard/sop?tab=manage`
- [ ] AddContentModal still works from Manage tab
- [ ] No duplicate nav entries in Sidebar or NavbarDashboard

### Files likely touched

| File | Action |
|------|--------|
| `src/app/(dashboard)/dashboard/sop/page.tsx` | Add tabs + compose Browse/Manage |
| `src/app/(dashboard)/dashboard/addSop/page.tsx` | Redirect or thin wrapper |
| `src/app/(dashboard)/dashboard/sop/components/SopManageTab.tsx` | **New** — extracted manage UI |
| `src/components/Sidebar.tsx` | Remove SOP Management item |
| `src/components/NavbarDashboard.tsx` | Update page titles |
| `src/lib/pagePermissions.ts` | Optional path mapping tweak |

---

## General dev guidelines

- **Stack:** Next.js App Router, React Query, react-hook-form, Tailwind, Supabase auth
- **Brand colour:** `#C62828` (red) — keep existing styling language
- **Do not commit** `.env` or secrets
- **Test as:** employee (view only), delegated user with sop:add, manager/admin
- **PR description:** List which of the 4 tasks are complete and include screenshots (desktop + mobile)

---

## Testing checklist (before handoff)

### Task 1 — Auto-fill
- [ ] Log in as employee → start self-appraisal → email prefilled
- [ ] Log in as L4+ supervisor → appraisal for direct report → employee fields populate
- [ ] Create skill log → supervisor shown, defaults sensible
- [ ] Submit leave → correct user_id on server

### Task 2 — Email mask
- [ ] Forgot password → success shows masked email
- [ ] Reset password link → set-password page shows masked email
- [ ] Inspect DOM — full email not in visible text nodes

### Task 3 — Skill log table
- [ ] Desktop table renders with data
- [ ] Sign off / delete / edit draft work from table row
- [ ] Mobile layout acceptable

### Task 4 — SOP tabs
- [ ] Employee sees Browse only
- [ ] Admin/manager with add sees both tabs
- [ ] Upload + delete work in Manage tab
- [ ] Sidebar has one SOP link
- [ ] Old `/dashboard/addSop` URL redirects

---

## Questions?

If anything is ambiguous, default to:
1. Match existing Appraisal list patterns for tables
2. Use existing permission helpers — do not add new role checks
3. Ask before changing API routes or database schema

---

*Task brief — August 2026. Wills Farms platform.*
