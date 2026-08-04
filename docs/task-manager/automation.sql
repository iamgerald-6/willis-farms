-- ============================================================================
-- Task Manager — automation (scheduled monthly report + deadline reminders)
-- Run this once in the Supabase SQL editor, same as schema.sql /
-- supporting-tables.sql were. No RLS — matches the rest of Task Manager;
-- these tables are only ever touched via the service-role key from the
-- Next.js API/cron routes.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Monthly report schedule ─────────────────────────────────────────────
-- Singleton config row (there's only ever one). day_of_month is capped at
-- 28 so it's always valid regardless of month length. The cron job checks
-- this once a day at 9am and, when it's the configured day and this month's
-- report hasn't gone out yet, generates + emails the PREVIOUS calendar
-- month's report to `recipients`.
create table if not exists tm_report_schedule (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  recipients jsonb not null default '[]',
  -- "YYYY-MM" of the period last auto-sent, so a cron re-run on the same
  -- day (or a manual trigger) never double-sends within the same month.
  last_sent_period text,
  updated_at timestamptz not null default now()
);

insert into tm_report_schedule (enabled, day_of_month, recipients)
select false, 1, '[]'::jsonb
where not exists (select 1 from tm_report_schedule);

-- Auto-sent reports have no logged-in user behind them, so this needs to
-- accept null (previously "not null" — was fine when every report was sent
-- manually by a Senior Management user).
alter table tm_monthly_reports alter column generated_by drop not null;

-- ── Deadline reminder settings ──────────────────────────────────────────
-- Singleton config row. When enabled, the daily 9am cron emails each
-- task's owner once, the first day their task is within `days_before_due`
-- days of its due date, and again every day the task remains overdue.
-- cc_recipients is optional — extra addresses (e.g. a supervisor) copied
-- on every reminder email in addition to the task owner, in case an
-- owner's inbox is unreachable or you just want a backup set of eyes.
create table if not exists tm_reminder_settings (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default true,
  days_before_due int not null default 14 check (days_before_due between 1 and 30),
  cc_recipients jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- Safe to re-run: adds the column if this table already exists from an
-- earlier run of this same file.
alter table tm_reminder_settings add column if not exists cc_recipients jsonb not null default '[]';

insert into tm_reminder_settings (enabled, days_before_due)
select true, 14
where not exists (select 1 from tm_reminder_settings);

-- ── Reminder send log ────────────────────────────────────────────────────
-- Dedup ledger, checked by the cron job before it sends anything:
--   - 'due_soon' — app code checks whether ANY row already exists for this
--     task_id, regardless of date, so the upcoming-deadline nudge only
--     ever goes out once per task.
--   - 'overdue' — app code checks for a row with today's date. A new row
--     (and email) is expected each new day the task remains overdue.
-- The unique constraint below is a safety net against a cron re-run on the
-- same day double-sending; it isn't what makes 'due_soon' one-time — that's
-- enforced in application code, since sent_on legitimately varies per row.
create table if not exists tm_reminder_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tm_tasks(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('due_soon', 'overdue')),
  sent_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (task_id, reminder_type, sent_on)
);

create index if not exists tm_reminder_log_task_id_idx on tm_reminder_log(task_id);
