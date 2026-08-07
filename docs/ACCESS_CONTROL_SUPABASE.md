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
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;
```

---

## 2) Access model

| Mode | DB state | Behaviour |
|------|----------|-----------|
| **Standard employee** | `access_tier = standard`, `role = employee` | Default app pages (leave, appraisal, SOP view, etc.) |
| **Full access** | `role = admin` or `manager`, `access_tier = standard` | All sidebar pages (same as before) |
| **L5+ grade** | `grade_level` L5–L7 | Full appraisal / justifications per existing rules |
| **Sub-admin (delegated)** | `access_tier = delegated`, `page_permissions = [...]` | **Only** listed pages — even 9/10 pages is still delegated, not full admin |

Super admin rows cannot be changed from Access Control.

---

## 3) Who can open Access Control

- `super_admin`
- `admin`
- `manager` with **L5+** (`grade_level` index ≥ 4)

**UI:** Profile dropdown → **Access Control** (not on Users page).

**Route:** `/dashboard/access-control` (listing) · `/dashboard/access-control/[userId]` (manage user)

**API:** `PATCH /api/access-control` · `GET /api/me` (current user status)

---

## 4) Page permission keys

Defined in `src/lib/pagePermissions.ts`:

- `dashboard`, `users`, `notifications`
- `hc:leave`, `hc:appraisal`, `hc:justifications`, `hc:skillLog`, `hc:promotion`, `hc:recruitment`
- `tm:tasks`, `tm:calendar` (includes former Schedule Planner: off days, leave on calendar)
- `policies`, `sop:view`, `sop:add`

---

## 5) User creation unchanged

Create User still inserts without `access_tier` / `page_permissions` — DB defaults apply (`standard`, `[]`, `is_disabled = false`).

---

## 6) Disable account

- Column: `users.is_disabled` (boolean, default `false`)
- Managed from **Access Control → Manage User**
- Disabled users are banned in Supabase Auth and blocked at login + dashboard routes
