# Appraisal System Update — Supabase Migration Guide

This implements the Appraisal System Business Logic Update spec:

- Item ratings stay **1–5**. A standardized, weight-based computation
  converts them into a **0–100% Final Score** (see "Scoring model" below).
  Q4 = Annual (no separate annual form)
- Automated promotion eligibility (Final Score ≥ 70%, no manual override)
- Access control: Manager / Admin / Super Admin / grade L5+ → full access
- Self-assessment → email to supervisor → supervisor evaluation → Final Review
  Meeting (kept per business decision) → locked
- 15-day deadline per quarter, reminders at 15/7/1 days, auto-lock on miss
+ 10-day completion window after each quarter ends; reminders at 15/7/1 days
+  before quarter end; one notice on the first day after quarter end; lock on
+  day 10 of the next quarter
- Supervisor-caused lock → 10-point penalty (waivable via Justification)
+ Supervisor-caused lock → 10-point penalty (one appeal); failed reopen → −15
+  supervisor / −5 employee, no second appeal

Run the SQL below in the Supabase SQL editor, in order.

> **Getting `Could not find the 'deadline_at' column of 'appraisals' in the
> schema cache`?** That means Section 1 below hasn't been run against your
> database yet. Paste the `alter table public.appraisals ...` block into the
> Supabase SQL editor and run it — the error goes away as soon as the
> column exists. Supabase's schema cache updates automatically right after
> the `alter table` succeeds, so no separate "reload cache" step is needed.

---

## 0) Scoring model — 1–5 input → 0–100% Final Score

Each review item is still rated **1–5**, exactly as before:

| Rating | Meaning |
|---|---|
| 1 | Unsatisfactory |
| 2 | Below Expectation |
| 3 | Meets Expectation |
| 4 | Above Expectation |
| 5 | Excellent |

The **standardized computation** (implemented once, shared by every form,
in `src/lib/appraisal/scoring.ts`) turns those 1–5 ratings into the 0–100%
Final Score using each review section's existing weight:

1. **Section average** = mean of that section's item ratings (1–5 scale).
2. **Weighted raw score** = `Σ(section weight × section average) / Σ(weights with a rating)`
   — still on a 1–5 scale.
3. **Final score (%)** = `(weighted raw score ÷ 5) × 100`.

So a perfect "5" across every item still comes out to 100%, a straight "1"
comes out to 20%, and everything in between is a smooth, weighted
percentage. This 0–100% number is what gets banded (Outstanding /
Exceeds / Meets / Needs Improvement / Unsatisfactory), stored as each
quarter's `final_quarter_score`, and averaged across Q1–Q4 into the
employee's annual `final_score` for promotion eligibility.

Nothing about the database schema changes because of this — `RatingItem`
values are just stored as integers 1–5, same column shapes as before.

---

## 1) `appraisals` table — new columns

```sql
alter table public.appraisals
  add column if not exists employee_email text,
  add column if not exists supervisor_email text,
  add column if not exists deadline_at timestamptz,
  add column if not exists employee_submitted_at timestamptz,
  add column if not exists supervisor_submitted_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_reason text,
  add column if not exists final_quarter_score numeric,
  add column if not exists supervisor_id uuid,
  add column if not exists employee_user_id uuid,
  add column if not exists reopened_deadline_at timestamptz,
  add column if not exists appeal_exhausted boolean not null default false,
  add column if not exists employee_penalty_points int not null default 0;

-- Drop old locked_reason check if present, then re-add with reopen_incomplete
alter table public.appraisals drop constraint if exists appraisals_locked_reason_check;
alter table public.appraisals add constraint appraisals_locked_reason_check
  check (locked_reason in (
    'employee_incomplete',
    'supervisor_incomplete',
    'reopen_incomplete'
  ));

-- Status now includes: open, submitted, final_reviewed, locked, reopened
-- (existing values 'draft' / 'final_reviewed' already in use — no destructive change)
```

**Also required** — your existing `appraisals_status_check` constraint only
allows the old status values, so inserting a row with `status = 'open'`
(or `'locked'` / `'reopened'`) fails with:

```
new row for relation "appraisals" violates check constraint "appraisals_status_check"
```

Run this to widen it to the full set of values used anywhere in the app
(old + new, so no existing rows are invalidated):

```sql
alter table public.appraisals drop constraint if exists appraisals_status_check;
alter table public.appraisals add constraint appraisals_status_check
  check (status in ('draft', 'submitted', 'open', 'final_reviewed', 'locked', 'reopened', 'completed'));
```

> `deadline_at` = quarter end + **10 days** (lock date). Reminders fire at
> **15 / 7 / 1 days before quarter end**, then a **one-time notice** on the
> first day after quarter end. If a supervisor appeal is **approved**, the
> appraisal reopens with `reopened_deadline_at` = approval + 10 days; missing
> that window locks again with `locked_reason = 'reopen_incomplete'`,
> `employee_penalty_points = 5`, and a 15-point supervisor penalty.
>
> `supervisor_email` is a new field on the self-assessment form (alongside
> the existing free-text "Immediate Supervisor" name) — it's what the
> "employee submitted → notify supervisor" email actually sends to, since
> the existing schema has no reliable employee→supervisor user link.

Recommended indexes for the reminder/lock cron:

```sql
create index if not exists appraisals_deadline_idx
  on public.appraisals (deadline_at)
  where status in ('open', 'draft', 'submitted', 'reopened');

create index if not exists appraisals_employee_user_idx
  on public.appraisals (employee_user_id);

create index if not exists appraisals_supervisor_idx
  on public.appraisals (supervisor_id);
```

---

## 2) `supervisor_penalties` table (new)

Tracks the 10-point deduction applied when a supervisor causes a quarter to
lock by not completing their evaluation in time.

```sql
create table if not exists public.supervisor_penalties (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null,
  appraisal_id bigint not null references public.appraisals(id) on delete cascade,
  review_quarter text not null,
  review_year int not null,
  points_deducted int not null default 10,
  waived boolean not null default false,
  justification_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supervisor_penalties_supervisor_idx
  on public.supervisor_penalties (supervisor_id, review_year, review_quarter);
```

The penalty is applied by subtracting `points_deducted` from the
supervisor's **own** `final_quarter_score` for that same quarter/year when
it is computed — not from the employee's score on the appraisal that
locked. If the justification for it is later approved, `waived` flips to
`true` and the deduction is excluded from that recomputation.

---

## 3) `appraisal_justifications` table (new)

```sql
create table if not exists public.appraisal_justifications (
  id uuid primary key default gen_random_uuid(),
  appraisal_id bigint not null references public.appraisals(id) on delete cascade,
  supervisor_id uuid not null,
  reason_text text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_by_name text,
  review_notes text,
  reviewed_at timestamptz,
  points_waived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists appraisal_justifications_appraisal_idx
  on public.appraisal_justifications (appraisal_id);

create index if not exists appraisal_justifications_status_idx
  on public.appraisal_justifications (status);
```

One appraisal can have multiple justification attempts (e.g. rejected, then
resubmitted) — the UI shows the latest one to the employee.

---

## 4) `users` table — new columns

```sql
alter table public.users
  add column if not exists final_score numeric,
  add column if not exists final_score_year int,
  add column if not exists promotion_eligible boolean not null default false;
```

- `final_score` = average of the employee's 4 quarters' `final_quarter_score`
  for `final_score_year`, written once Q4 locks/finalizes.
- `promotion_eligible` = `final_score >= 70`. **Fully computed — there is no
  manual override anywhere in the UI.** Other modules (e.g. the Promotion
  module, compensation/bonus logic) should read `users.final_score` and
  `users.promotion_eligible` directly rather than re-deriving eligibility.

> Note: there is currently no automated compensation/bonus calculation
> module in this codebase — `compensation_review_input` on `appraisals` is
> a free-text field filled by the supervisor, not a formula. `final_score`
> is now available on `users` for any future comp/bonus logic to read.

---

## 5) Auto-update `updated_at` (reuse existing trigger if present)

If you haven't already created `public.set_updated_at()` (from the careers
migration), run this once:

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
```

Then attach it to `supervisor_penalties`:

```sql
drop trigger if exists supervisor_penalties_updated_at on public.supervisor_penalties;
create trigger supervisor_penalties_updated_at
  before update on public.supervisor_penalties
  for each row execute function public.set_updated_at();
```

---

## 6) Environment variables

Reminders and notification emails use **Resend** (already used on the
Careers page):

- `RESEND_API_KEY` — required to actually send email; without it, the app
  logs a warning and continues (nothing breaks, but no email goes out)
- `RESEND_FROM_EMAIL` — e.g. `Wills Farms HR <hr@willsfarms.com>` (falls
  back to `onboarding@resend.dev` for testing)
- `CRON_SECRET` — required so only Vercel Cron (or you, manually, with the
  header) can trigger `/api/cron/appraisal-reminders`

> **⚠️ TEMPORARY (testing only):** `RESEND_FROM_EMAIL` is intentionally
> **not set** right now, so every appraisal email currently sends from
> Resend's shared sandbox address (`onboarding@resend.dev`). That address
> only reliably delivers to the email you personally signed up to Resend
> with — real employee/supervisor addresses will likely bounce or never
> arrive. This is fine for today's testing, but **do this before going
> live**:
> 1. Verify a sending domain (e.g. `willsfarms.com`) under **Domains** in
>    the Resend dashboard (adds SPF/DKIM DNS records at your registrar).
> 2. Once verified, set `RESEND_FROM_EMAIL="Wills Farms HR <hr@willsfarms.com>"`
>    (or whichever verified address) in `.env` **and** in Vercel's project
>    env vars for production.
> 3. No code changes are needed for this — `sendViaResend()` in
>    `src/lib/appraisal/emails.ts` already reads `RESEND_FROM_EMAIL` first
>    and only falls back to the sandbox address when it's unset.

The cron schedule itself is defined in `vercel.json` at the project root —
no extra Vercel dashboard configuration needed once deployed.

---

## 7) Access control summary (Section 4 of the spec)

Implemented in `src/lib/accessControl.ts` as `hasFullAppraisalAccess()`:

| Viewer | Access |
|---|---|
| `role = manager / admin / super_admin` | Full access to all employees' appraisals |
| `grade_level >= L5` (any role) | Full access to all employees' appraisals |
| Everyone else (< L5, not Manager/Admin/Super Admin) | Own appraisal data only |

This is a **new, appraisal-specific** helper — it does not change the
existing `canViewOthers` / `isSupervisor` (L4+) helpers used by Promotion
and Skill Logs, which govern a different thing (who can act as a line
supervisor on someone's record, not who has org-wide visibility).
