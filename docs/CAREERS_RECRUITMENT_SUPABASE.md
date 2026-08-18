# Careers & Recruitment (Supabase) — Setup Guide

This implements the agreed hiring flow:

1. **Public `/careers`** — apply form (no interview guide)
2. **WillsOne HR dashboard** — applications inbox + status pipeline
3. **Interview guides** — internal only when status is `shortlisted` or `interview`

---

## 1) Run this SQL in Supabase

```sql
create extension if not exists "pgcrypto";

-- Job applications (public apply + HR inbox)
create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  full_name text not null,
  email text not null,
  phone text not null,
  location text,
  role_slug text not null,
  role_title text not null,
  cover_note text,
  cv_url text,
  cv_public_id text,
  status text not null default 'applied'
    check (status in ('applied','under_review','shortlisted','interview','hold','onboarding','offer','rejected')),
  hr_notes text,
  interview_form_data jsonb not null default '{}'::jsonb,
  interview_submitted_at timestamptz,
  interview_submitted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_applications_created_at_idx
  on public.job_applications (created_at desc);

create index if not exists job_applications_status_idx
  on public.job_applications (status);

create index if not exists job_applications_email_idx
  on public.job_applications (email);

create index if not exists job_applications_reference_idx
  on public.job_applications (reference_number);

-- Optional: auto-update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists job_applications_updated_at on public.job_applications;
create trigger job_applications_updated_at
  before update on public.job_applications
  for each row execute function public.set_updated_at();
```

---

## 2) Environment variables

Same as the rest of WillsOne:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

CV uploads use **Cloudinary** (same preset as other dashboard uploads):

- Upload preset: `willsUpload`
- Folder: `CareersCVs`

No extra env vars required for Cloudinary if the preset is already configured as unsigned.

### Application confirmation email (Resend)

When an application is submitted, the candidate receives a confirmation email with their reference number.

Set in Vercel (or `.env.local`):

- `RESEND_API_KEY` — your Resend API key
- `RESEND_FROM_EMAIL` — verified sender, e.g. `Wills Farms Careers <careers@willsfarms.com>`
- `CAREERS_REPLY_TO_EMAIL` — optional; defaults to `info@willsfarms.com`

If `RESEND_API_KEY` is missing, the application is still saved but no email is sent.

---

## 3) Status pipeline

| Status | Meaning |
|--------|---------|
| `applied` | New submission from public form |
| `under_review` | HR is screening |
| `shortlisted` | Invited — interview guide unlocks in dashboard |
| `interview` | Panel interview in progress |
| `hold` | Panel decision — reserve / pending |
| `onboarding` | Hire confirmed — candidate completing onboarding |
| `offer` | Onboarding complete / offer stage |
| `rejected` | Not proceeding |

---

## 4) Routes

| Route | Purpose |
|-------|---------|
| `POST /api/careers/apply` | Public application submit |
| `GET /api/careers/applications` | HR inbox list |
| `PATCH /api/careers/applications` | Update status / HR notes |
| `GET /api/careers/interview?application_id=` | Fetch interview evaluation |
| `POST /api/careers/interview` | Save staged interview (actions: `save_draft`, `send_panel_invites`, `schedule_stage2`, `complete_stage2`, `finalize`, `confirm_decision`) |
| `GET/POST /api/careers/onboarding/[token]` | Public onboarding magic link |
| `GET/PATCH /api/careers/onboarding` | HR onboarding list + HR-only fields |
| `POST /api/careers/onboarding/resend` | Resend 7-day onboarding link |

Run `docs/careers/onboarding.sql` after the base schema to add `hold` / `onboarding` statuses and onboarding tables.

### Staged interview flow

1. **Panel setup** (before stages) — panel names/emails, interview start time, location → Resend invites with WillsOne link
2. **Stage 1** — Sections A & B + schedule Stage 2 practical → email to candidate + `info@willsfarms.com`
3. **Stage 2** — Section C scenarios/practical
4. **Stage 3** — Tabular evaluation (Section D), panel decision, disqualifiers

Panel invite link format: `/dashboard/humanCapital/recruitment?interview={application_id}`

Email base URL: `http://localhost:3000` in development; production uses `siteContent.seo.siteUrl` or `NEXT_PUBLIC_APP_URL`.

Optional env: `NEXT_PUBLIC_APP_URL` — override link base in emails (e.g. `https://www.willsfarms.com`).

Dashboard: `/dashboard/humanCapital/recruitment` (admin / manager)

---

## 5) Promotions migration (if not yet run)

Grade-specific promotion forms also need:

```sql
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS promotion_step text,
  ADD COLUMN IF NOT EXISTS time_in_current_role text,
  ADD COLUMN IF NOT EXISTS business_need_confirmed boolean,
  ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
```
