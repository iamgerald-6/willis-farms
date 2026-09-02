# WillsOne — infrastructure & monthly costs

This document lists every paid or metered third-party service the project uses, what it does in the app, required environment variables, and **estimated monthly cost** (USD). Figures are indicative — check each vendor’s billing page for your actual usage.

**Last reviewed:** September 2026

---

## Summary table

| Service | Role in WillsOne | Billing model | Typical monthly cost |
|--------|-------------------|---------------|----------------------|
| [Vercel](#1-vercel-hosting--cron) | Host Next.js app, API routes, scheduled crons | Subscription + usage | **$0–$20+** (Hobby free → Pro ~$20/seat) |
| [Supabase](#2-supabase-database--auth) | PostgreSQL, auth, RLS, server-side data | Tier + usage | **$0–$25+** (Free → Pro ~$25/project) |
| [Cloudinary](#3-cloudinary-media-storage) | CVs, passports, policies, task attachments | Storage + bandwidth + transforms | **$0–$99+** (Free → Plus ~$99) |
| [Resend](#4-resend-email) | All transactional email | Per email sent | **$0–$20+** (Free 3k/mo → Pro ~$20) |
| [Anthropic (Claude)](#5-anthropic-claude-ai) | Recruitment AI, task manager, reports | Pay-per-token | **$5–$200+** (usage-dependent) |
| [Domain & DNS](#6-domain--dns) | `willsfarms.com` (or production domain) | Annual ÷ 12 | **~$1–3/mo** amortised |
| [GitHub](#7-github-optional) | Source control (if used) | Per org/repo | **$0–$4/user** |

**Rough total (small team, moderate hiring traffic):** about **$50–$150/month** on paid tiers excluding heavy AI volume.  
**Minimum viable (free tiers + low AI):** about **$0–$30/month** plus domain.

---

## 1. Vercel (hosting + cron)

**What we use it for**

- Production and preview deployments of the Next.js 16 app
- Serverless API routes (`src/app/api/**`, legacy `src/pages/api/**`)
- Scheduled jobs defined in `vercel.json`:
  - `/api/cron/appraisal-reminders` — daily 06:00 UTC
  - `/api/task-manager/cron/daily` — daily 09:00 UTC
  - `/api/task-manager/cron/hourly-rollover` — weekdays 17:00 UTC
  - `/api/cron/careers-daily-digest` — daily 08:00 UTC

**Env vars**

- `VERCEL_URL` — set automatically on Vercel
- `NEXT_PUBLIC_APP_URL` — canonical site URL (set per environment)
- `CRON_SECRET` — protects cron endpoints from public abuse

**Pricing (indicative)**

| Plan | Cost | Notes |
|------|------|--------|
| Hobby | $0 | Personal/non-commercial; crons limited |
| Pro | ~$20/user/mo | Crons, team, commercial use |
| Usage | Variable | Extra function execution, bandwidth beyond included limits |

**Cost drivers:** API traffic (recruitment uploads, AI routes with `maxDuration: 60`), number of deploys, cron invocations.

---

## 2. Supabase (database + auth)

**What we use it for**

- PostgreSQL for all app data (HR, recruitment, appraisal, task manager, policies, etc.)
- Supabase Auth for staff login (`users` linked to auth users)
- Service role key for server-side admin operations (API routes)

**Env vars**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose to browser)

**Pricing (indicative)**

| Plan | Cost | Includes (typical) |
|------|------|---------------------|
| Free | $0 | 500 MB DB, 50k MAU auth, pauses after inactivity |
| Pro | ~$25/project/mo | 8 GB DB, daily backups, no pause |
| Add-ons | Variable | Extra DB size, egress, compute |

**Cost drivers:** Row growth (applications, audit logs), auth MAU, API egress from dashboard reads.

**Note:** File binaries are **not** stored in Supabase in this project — they go to **Cloudinary**.

---

## 3. Cloudinary (media storage)

**What we use it for**

- Careers: CVs, passport bio pages, certificates, offer letters, medical reports
- Policies & SOPs PDFs
- Task manager document uploads
- Leave / HR attachments where applicable

**Key files:** `src/lib/cloudinary.ts`, `src/lib/careers/uploadCareersFile.ts`, `src/lib/careers/uploadCv.ts`

**Env vars**

- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`

**Pricing (indicative)**

| Plan | Cost | Notes |
|------|------|--------|
| Free | $0 | Limited credits (storage + transformations + bandwidth) |
| Plus | ~$99/mo | Higher quotas for production HR volume |
| Advanced | Custom | Enterprise SLA |

**Cost drivers:** Number and size of PDFs/images uploaded, AI validation routes that re-fetch files, bandwidth on download/preview.

---

## 4. Resend (email)

**What we use it for**

- Staff invite & password setup
- Careers: application confirmation, referee invites, interview panels, onboarding links, offer letters, HR notifications
- Task manager assignment/deadline emails
- Appraisal / monthly report emails (where enabled)

**Key files:** `src/lib/email/resendClient.ts`, `src/lib/careers/interviewEmails.ts`, `src/lib/careers/applicationConfirmationEmail.ts`

**Env vars**

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (must use a **verified domain** in production)
- `CAREERS_REPLY_TO_EMAIL` (optional; defaults to `info@willsfarms.com`)

**Pricing (indicative)**

| Plan | Cost | Sends |
|------|------|--------|
| Free | $0 | ~3,000 emails/month |
| Pro | ~$20/mo | ~50,000 emails/month |
| Overage | Per 1k | Beyond plan limit |

**Cost drivers:** Volume of applications, referee emails (2–5 per applicant), interview panel invites, onboarding/resend flows.

---

## 5. Anthropic (Claude AI)

**What we use it for**

| Feature | Route / module |
|---------|----------------|
| Job application AI screening | `src/lib/careers/screenApplication.ts` |
| CV field extraction | `src/app/api/careers/applications/extract-cv/route.ts` |
| Passport bio validation | `src/app/api/careers/applications/validate-passport-bio/route.ts` |
| Medical report validation | `src/app/api/careers/onboarding/validate-medical-report/route.ts` |
| Offer letter generation | `src/app/api/careers/onboarding/offer-letter/generate/route.ts` |
| Interview reports & analysis | `src/app/api/careers/interview/**` |
| Task manager AI | Task manager modules |
| Monthly reports | `src/lib/reports/sendMonthlyReport.tsx` |

**Env vars**

- `ANTHROPIC_API_KEY`
- `TASK_MANAGER_AI_MODEL` (optional; default `claude-sonnet-4-5`)

**Pricing:** **Pay-per-use** (input + output tokens). No fixed monthly fee.

**Rough usage examples (order of magnitude, not quotes):**

- Light internal testing: **$5–$20/mo**
- Active recruitment (tens of applications/week with screening + passport checks): **$30–$100/mo**
- Heavy parallel AI (many interviews, regenerations, large PDFs): **$100–$300+/mo**

Monitor at [console.anthropic.com](https://console.anthropic.com) → Usage.

---

## 6. Domain & DNS

**What we use it for**

- Public website and staff dashboard URL
- Resend **domain verification** (SPF/DKIM) for `@willsfarms.com` sending
- SSL terminated by Vercel once domain is pointed

**Cost:** Registrar fee only — typically **$10–40/year** (~**$1–3/month**).

Not configured via `.env`; managed at your registrar + Vercel domain settings.

---

## 7. GitHub (optional)

**What we use it for**

- Source control and CI (if connected to Vercel)

**Pricing:** Free for private repos (limited minutes) or **~$4/user/mo** (Team).

---

## Environment variables checklist

Copy from `.env` / Vercel project settings **per environment** (Develop / Testing / Production):

```env
# App URL
NEXT_PUBLIC_APP_URL=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=
CAREERS_REPLY_TO_EMAIL=

# AI
ANTHROPIC_API_KEY=
TASK_MANAGER_AI_MODEL=

# Cron protection (Vercel)
CRON_SECRET=
```

---

## Recommended setup by environment

| Environment | Folder | Vercel project | Supabase | Notes |
|-------------|--------|----------------|----------|--------|
| **Develop** | `Develop/Willsone` | Preview or `dev.*` | Dev project or dev schema | Local + shared dev DB |
| **Testing** | `Testing` | `staging.*` or Vercel preview | Staging Supabase project | QA, UAT, demo data |
| **Production** | `production` (deploy target) | Production domain | Production Supabase | Empty folder = placeholder until release pipeline |

Use **separate** Supabase projects and Resend domains/keys for Testing vs Production so test emails and data never touch live HR records.

---

## Related docs

- [`docs/environments/FOLDER_LAYOUT.md`](environments/FOLDER_LAYOUT.md) — Develop / Testing / Production folder structure
- `docs/task-manager/SETUP.md` — Task manager env setup
- `docs/CAREERS_RECRUITMENT_SUPABASE.md` — Recruitment database
- `vercel.json` — Cron schedules

---

## Action items for finance / ops

1. Confirm Vercel plan (Hobby vs Pro) for cron + commercial use.
2. Confirm Supabase Pro if database exceeds free tier or needs no auto-pause.
3. Verify domain on Resend before go-live (avoid sandbox `onboarding@resend.dev`).
4. Set Anthropic billing alerts and monthly cap if desired.
5. Review Cloudinary usage after first month of real applicant uploads.
