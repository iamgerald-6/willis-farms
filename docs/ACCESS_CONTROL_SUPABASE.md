# Access Control (Supabase + WillsOne)

Granular page access via **delegated** (sub-admin / half_admin) permissions, plus full access via existing **role** and **grade_level**.

---

## 1) Run this SQL in Supabase

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS access_tier text NOT NULL DEFAULT 'standard';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_access_tier_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_access_tier_check
  CHECK (access_tier IN ('standard', 'delegated'));

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS page_permissions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS access_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_updated_by uuid;

CREATE INDEX IF NOT EXISTS users_access_tier_idx
  ON public.users (access_tier);

UPDATE public.users
SET
  access_tier = COALESCE(access_tier, 'standard'),
  page_permissions = COALESCE(page_permissions, '[]'::jsonb)
WHERE access_tier IS NULL OR page_permissions IS NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS page_permission_levels jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;

-- Audit trail: who added this user (via Add User). Null for pre-existing/seed rows.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Account setup status (email_verified / email_confirm should be boolean).
-- Run once if your columns are still text:
--
-- ALTER TABLE public.users
--   ALTER COLUMN email_verified TYPE boolean USING (
--     CASE WHEN lower(trim(email_verified::text)) IN ('true','t','1','yes') THEN true ELSE false END
--   );
-- ALTER TABLE public.users
--   ALTER COLUMN email_confirm TYPE boolean USING (
--     CASE WHEN lower(trim(email_confirm::text)) IN ('true','t','1','yes') THEN true ELSE false END
--   );
-- ALTER TABLE public.users ALTER COLUMN email_verified SET DEFAULT false;
-- ALTER TABLE public.users ALTER COLUMN email_confirm SET DEFAULT false;
--
-- Backfill existing active users:
-- UPDATE public.users SET email_verified = true, email_confirm = true
-- WHERE email_verified = false;
```

Example delegated User Management levels in `page_permission_levels`:

- `{ "users": "view" }` — list only
- `{ "users": "add" }` — list + add user
- `{ "users": "edit" }` — full manage user + permissions

---

## 2) Access model

| Mode | DB state | Behaviour |
|------|----------|-----------|
| **Standard employee** | `access_tier = standard`, `role = employee` | Default app pages, all **view**-level (leave, appraisal, SOP view, etc.) — see §5 for the exact set |
| **Manager / Super Admin** | `role = manager` or `super_admin`, `access_tier = standard` | Full "edit" on every page (same as before) — unchanged |
| **Admin (default)** | `role = admin`, `access_tier = standard` | Same view-only set as an employee, **plus**: User Management = view only (no add/edit), Policies = add, SOP = add. See §3. |
| **L5+ grade** | `grade_level` L5–L7 | Full appraisal / justifications per existing rules |
| **Sub-admin (delegated)** | `access_tier = delegated`, `page_permission_levels = {...}` | Only the stored per-page levels apply — even 9/10 pages is still delegated, not full admin. This is also how an Admin or Manager gets customized beyond their default (e.g. granting a specific Admin "edit" on Users). |

Super admin rows cannot be changed from Access Control.

### 2a) Checkbox permission matrix (`page_permission_actions`)

Run after §1:

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS page_permission_actions jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Or run `docs/access-control/page-permission-actions.sql`.

Example delegated checkbox permissions:

```json
{
  "users": { "view": true, "add": true },
  "hc:leave": { "view": true, "add": true, "review": true },
  "dashboard": { "view": true }
}
```

Legacy `page_permission_levels` is still written for backward compatibility. The Manage User UI uses **checkboxes** (view / add / edit / review / approve) grouped by module section.

### 2b) Group permission presets (Phase 2)

Run after §2a:

```sql
-- docs/access-control/group-presets.sql
CREATE TABLE IF NOT EXISTS public.access_group_presets (
  group_key text PRIMARY KEY,
  page_permission_actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  updated_by uuid
);
```

| Group key | Applies to |
|-----------|------------|
| `employees` | All users with `role = employee` |
| `managers` | All users with `role = manager` |
| `admins` | All users with `role = admin` |
| `grade_l1_l3` | All users with grade L1–L3 (merged with role preset) |
| `grade_l4_l7` | All users with grade L4–L7 (merged with role preset) |

**Resolution order:** super admin bypass → individual override (`access_tier = delegated` + stored `page_permission_actions`) → role group preset + grade band preset (union) → built-in code defaults.

Edit group presets from **User Management** → filter tab (Employees, Managers, etc.) → matrix at top. **Manage User** on one row creates an individual override; use **Reset to group defaults** to revert.

---

## 3) User Management permission actions (`users` key)

| Action | Can do |
|--------|--------|
| **view** | See user listing only |
| **add** | Invite users (no Manage User) |
| **edit** | Full manage — disable accounts, change permissions |

These are independent checkboxes (not hierarchical radios). Manager (any grade) and Super Admin always get all three. **Admin's default is view only** unless raised via the matrix.

---

## 4) Who can open Access Control

- `super_admin` — always, full manage
- `manager` with **L5+** (`grade_level` index ≥ 4) — always, full manage
- `admin` — can open and view the listing by default, but cannot Add User or open Manage User unless explicitly granted `add`/`edit` on `users`
- Any employee delegated `view`+ on `users`

**UI:** Profile dropdown → **Access Control** (not on Users page).

**Route:** `/dashboard/access-control` (listing) · `/dashboard/access-control/[userId]` (manage user)

**API:** `PATCH /api/access-control` · `GET /api/me` (current user status) · `POST /api/access-control/resend-invite` (re-send invite, see §9) · `POST /api/account/complete-onboarding` (self-only, called from `/set-password`)

---

## 5) Page permission keys

Defined in `src/lib/pagePermissions.ts`:

- `dashboard`, `users`, `notifications`
- `hc:leave`, `hc:appraisal`, `hc:justifications`, `hc:skillLog`, `hc:promotion`, `hc:recruitment`
- `tm:tasks`, `tm:calendar` (includes former Schedule Planner: off days, leave on calendar)
- `policies`, `sop:view`, `sop:add`

---

## 6) User creation unchanged

Create User still inserts without `access_tier` / `page_permissions` — DB defaults apply (`standard`, `[]`, `is_disabled = false`).

---

## 7) Disable account

- Column: `users.is_disabled` (boolean, default `false`)
- Managed from **Access Control → Manage User**
- Disabled users are banned in Supabase Auth and blocked at login + dashboard routes

---

## 8) Audit trails

| Table | Who | When | Notes |
|-------|-----|------|-------|
| `users` | `created_by` (uuid, added above) | `created_at` (existing) | Set on `POST /api/create_user`. "Added on" shown to anyone with User Management view access; "Added by" (name) shown only to those with **edit** level (managers/super admin, or a delegated user granted edit). |
| `leave_requests` | `reviewed_by` (existing) | `reviewed_at` (existing) | No migration needed — already captured on `PATCH /api/leave/review`. Surfaced as "Approved by/on" or "Rejected by/on" once `status` is `approved`/`rejected`. |
| `manual_versions` | `uploaded_by` (existing) | `uploaded_at` (existing) | Already surfaced in Policies & Ops as "uploaded by / on". No change needed. |
| `content` (SOP) | `created_by` (existing) | `created_at` (existing) | Already captured; now also surfaced in the SOP hub/detail UI. |
| `promotions` | `submitted_by_user_id` (existing) | `created_at` (existing) | The L4+ staff member who submitted the assessment is the decision-maker (single-step); surfaced as "Submitted by / on" in the promotion detail + history table. |

None of the above (besides `users.created_by`) require a database change — the columns already exist, only the UI needed to surface them.

---

## 9) Account status (Pending / Active / Inactive)

User Management shows three states from existing columns:

| Status | Condition | Badge |
|--------|-----------|-------|
| **Inactive** | `is_disabled = true` | Grey |
| **Pending** | not disabled and `email_verified = false` | Amber |
| **Active** | not disabled and `email_verified = true` | Green |

**Lifecycle:**

1. `POST /api/create_user` inserts with `email_verified = false`, `email_confirm = false`, and sends the setup email.
2. Clicking the invite link opens `/set-password` but does **not** flip `email_verified` — still **Pending**.
3. When they save their password, the client calls `POST /api/account/complete-onboarding`, which sets `email_verified = true` and `email_confirm = true` (self-only, idempotent).
4. Admin disables account → `is_disabled = true` → **Inactive** regardless of verified state.

**Resend email:** `POST /api/access-control/resend-invite` for users still pending (`email_verified = false`, not disabled). Re-generates the setup link and sends via Resend.

**Login / forgot password:** Server validates against `public.users` before allowing access:

| Case | Login | Forgot password |
|------|-------|-----------------|
| Email not in `public.users` | Blocked | Blocked |
| Pending (`email_verified = false`) | Blocked — contact admin for setup link | Blocked |
| Disabled | Blocked | Blocked |
| Active | Allowed | Allowed (recovery link) |

Pending users can only complete setup via the **admin setup email** (`/set-password` invite flow), not forgot password.
