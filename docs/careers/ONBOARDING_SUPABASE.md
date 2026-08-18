# Onboarding tables — Supabase setup

## Run this

1. Ensure base careers schema exists (`docs/CAREERS_RECRUITMENT_SUPABASE.md` §1).
2. In **Supabase → SQL Editor**, paste and run the full contents of:

   **`docs/careers/onboarding.sql`**

No extra env vars. Uses the same `SUPABASE_SERVICE_ROLE_KEY` as recruitment.

---

## What gets created

| Object | Purpose |
|--------|---------|
| `job_applications.status` | Adds `hold` and `onboarding` to allowed values |
| `onboarding_tokens` | Magic links for `/onboarding/[token]` (7 days, reusable until expiry) |
| `onboarding_submissions` | Candidate answers + HR Section O fields |

---

## Column design (matches the app today)

### `onboarding_tokens`

| Column | Type | Notes |
|--------|------|-------|
| `application_id` | uuid FK | Links to hired candidate |
| `token` | text unique | Opaque link segment |
| `expires_at` | timestamptz | 7 days from issue |
| `revoked_at` | timestamptz | Set when HR resends (old link invalidated) |

### `onboarding_submissions`

| Column | Type | Notes |
|--------|------|-------|
| `form_data` | jsonb | All candidate fields (flexible — no schema migration when form fields change) |
| `hr_data` | jsonb | HR-only Section O (employee ID, salary, medical tracking, etc.) |
| `personal_completed_at` | timestamptz | Step 1 saved |
| `medical_completed_at` | timestamptz | Step 2 saved |
| `referee_completed_at` | timestamptz | Step 3 saved |
| `submitted_at` | timestamptz | Final submit → triggers `offer` status + HR email |

**One row per application** (`application_id` is unique).

---

## Status flow after migration

```
interview  →  (confirm hire)     → onboarding
interview  →  (confirm hold)     → hold
interview  →  (confirm reject)   → rejected
onboarding →  (candidate submits) → offer
```

---

## Decisions you may want to change later

These are **not** in the migration yet — tell us if you want any of them added now:

| Topic | Current choice | Alternative |
|-------|----------------|-------------|
| **Form storage** | Single `form_data` jsonb | Normalized tables per section (more SQL, stricter validation) |
| **Document uploads** | Checklist only (tick boxes) | Add `document_files jsonb` for Cloudinary URLs (Ghana Card, bank proof, etc.) |
| **Referee forms** | Candidate enters referee contacts only | Separate `referee_references` table when HR sends the official reference form |
| **Medical referral** | HR tracks dates in `hr_data` | Separate `medical_referrals` table linked to facility reports |
| **RLS** | Off (API uses service role) | Enable RLS if you ever query these tables from the browser client |
| **Link expiry** | 7 days (app constant) | Could add `link_expiry_days` per role in system definitions |

---

## Quick test after running SQL

```sql
-- Should return hold, onboarding in the check constraint
select pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.job_applications'::regclass
  and conname = 'job_applications_status_check';

-- Should list both tables
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'onboarding%';
```

Then in the app: confirm a **Hire** decision on a submitted interview — a row should appear in both `onboarding_tokens` and `onboarding_submissions`.
