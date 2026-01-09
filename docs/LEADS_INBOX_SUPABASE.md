# Leads Inbox (Supabase/Postgres) — Setup Guide

This codebase supports a basic admin-friendly **Leads Inbox** at:

- `/admin/leads`

Leads are captured via:
- `POST /api/lead`

and persisted to Supabase Postgres (table: `leads`) **if Supabase environment variables are configured**.

---

## 1) Create a Supabase project
1. Create a project in Supabase.
2. Note your project URL and keys.

---

## 2) Create the `leads` table (SQL)

Run the following in Supabase SQL Editor:

```sql
-- Enable UUID generation if not already enabled
create extension if not exists "pgcrypto";

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  ip_address text,
  lead_type text not null check (lead_type in ('gilts', 'pork')),
  full_name text not null,
  company text not null,
  phone text not null,
  email text not null,
  location text not null,
  status text not null default 'new' check (status in ('new','contacted','qualified','won','lost','archived')),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists leads_received_at_idx on public.leads (received_at desc);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_lead_type_idx on public.leads (lead_type);

-- Optional: basic email index
create index if not exists leads_email_idx on public.leads (email);

-- Recommended: keep table private; server uses service-role key for admin operations.
-- If you want to allow authenticated staff to query via Supabase Auth, add RLS policies.
```

---

## 3) Environment variables (Vercel)
Set these environment variables in Vercel (Project → Settings → Environment Variables):

### Required for database persistence
- `NEXT_PUBLIC_SUPABASE_URL` = (your Supabase project URL)
- `SUPABASE_SERVICE_ROLE_KEY` = (service role key; server-only)

### Optional (not required by current implementation)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (anon key; only if you later add client-side Supabase features)

### Admin authentication (recommended)
The `/admin/*` routes support HTTP Basic Auth via middleware:

- `ADMIN_USER` = (e.g., `willsadmin`)
- `ADMIN_PASSWORD` = (a strong password)

If these are not set, admin pages are accessible without auth (intended for local dev only).

---

## 4) How it works (high-level)
- The lead form submits to `/api/lead`.
- The server applies rate limiting + honeypot spam protection.
- If Supabase is configured, the lead is inserted into `public.leads`.
- The admin page queries and displays the latest 300 leads and lets you update statuses.

---

## 5) Security note
- Do **not** expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Keep admin routes protected in production using `ADMIN_USER` + `ADMIN_PASSWORD` (or replace with SSO/NextAuth later).

