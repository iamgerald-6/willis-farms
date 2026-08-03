-- AI usage budget alert — lets an admin set a monthly USD budget for the
-- Anthropic API (the same account used for document extraction, and now
-- also for the report's executive summary), see current spend against it
-- in Automation settings, and get emailed once if it's crossed in a given
-- calendar month.
--
-- This is a singleton config row, same pattern as tm_report_schedule and
-- tm_reminder_settings.
--
-- Run this once in the Supabase SQL editor, same as the earlier files.

create table if not exists tm_ai_usage_settings (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  monthly_budget_usd numeric(10, 2),
  recipients jsonb not null default '[]',
  -- "YYYY-MM" of the last calendar month an over-budget alert was actually
  -- sent for — prevents re-sending the same alert every day for the rest
  -- of the month once the budget's already been crossed once.
  last_alerted_period text,
  updated_at timestamptz not null default now()
);

-- Seed the single settings row if the table is empty, same as the other
-- singleton config tables — the app always expects exactly one row.
insert into tm_ai_usage_settings (enabled, monthly_budget_usd, recipients)
select false, null, '[]'
where not exists (select 1 from tm_ai_usage_settings);
