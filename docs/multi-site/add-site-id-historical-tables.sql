-- ============================================================================
-- Add site_id to leave_requests, appraisals, skill_logs, promotions
-- + best-effort backfill from each employee's CURRENT site
-- Phase 3 of the multi-site access architecture — see
-- docs/SITE_ACCESS_ARCHITECTURE.md §3.4 and §6.2.
-- Run ONCE in the Supabase SQL editor. Read the whole file before running it.
--
-- WHY: none of these four tables store a site today. Going forward, each
-- new row captures a SNAPSHOT of the employee's site_id at the moment the
-- record is created (application code change, not part of this script) —
-- so a later transfer never silently changes what site a historical record
-- "belongs to". This script only handles EXISTING rows.
--
-- KNOWN, DOCUMENTED LIMITATION (confirmed during the audit, not guessed):
-- there is no history of past org-placement changes before this session's
-- org-placement-audit-log migration. The only data available for existing
-- rows is each employee's CURRENT users.site_id. For any employee who has
-- ever transferred sites, their PRE-transfer historical records will be
-- backfilled with their NEW site — inaccurate for that employee's older
-- records specifically, unavoidable given no better data exists. This is
-- the tradeoff you already confirmed accepting (run audit logging going
-- forward + backfill from current site with this limitation documented).
--
-- Every table's backfill logic below is different because each links back
-- to `users` through a different, table-specific relationship — quoted
-- explicitly rather than assumed uniform.
-- ============================================================================

do $$
declare
  unmatched_count int;
begin
  ---------------------------------------------------------------------------
  -- leave_requests — links via user_id -> users.user_id (direct, reliable)
  ---------------------------------------------------------------------------
  alter table leave_requests add column if not exists site_id integer references sites(id);

  update leave_requests lr
  set site_id = u.site_id
  from users u
  where u.user_id = lr.user_id
    and lr.site_id is null;

  select count(*) into unmatched_count from leave_requests where site_id is null;
  raise notice 'leave_requests: % row(s) left with no site_id (no matching user, or user has no site set)', unmatched_count;

  ---------------------------------------------------------------------------
  -- appraisals — links via employee_user_id -> users.user_id. This column
  -- is nullable on appraisals (confirmed in the audit); rows where it's
  -- null are left unbackfilled rather than guessed at via a weaker match
  -- (e.g. employee_name text matching), since a wrong site is worse than a
  -- missing one for a security boundary.
  ---------------------------------------------------------------------------
  alter table appraisals add column if not exists site_id integer references sites(id);

  update appraisals a
  set site_id = u.site_id
  from users u
  where u.user_id = a.employee_user_id
    and a.site_id is null;

  select count(*) into unmatched_count from appraisals where site_id is null;
  raise notice 'appraisals: % row(s) left with no site_id (employee_user_id is null/unmatched, or matched user has no site set)', unmatched_count;

  ---------------------------------------------------------------------------
  -- skill_logs — links via employee_id -> users.user_id (direct, reliable)
  ---------------------------------------------------------------------------
  alter table skill_logs add column if not exists site_id integer references sites(id);

  update skill_logs sl
  set site_id = u.site_id
  from users u
  where u.user_id = sl.employee_id
    and sl.site_id is null;

  select count(*) into unmatched_count from skill_logs where site_id is null;
  raise notice 'skill_logs: % row(s) left with no site_id (no matching user, or user has no site set)', unmatched_count;

  ---------------------------------------------------------------------------
  -- promotions — this table had NO direct FK to the employee being
  -- promoted (submitted_by_user_id is the SUBMITTER/supervisor who filed
  -- the request, never the employee). Closing that gap properly rather
  -- than working around it: add a real employee_user_id FK, resolved via
  -- employee_company_id -> users.company_id (the only employee-identifying
  -- data this table has), and a supervisor_id FK snapshotting that
  -- employee's actual supervisor at backfill time — so it's visible
  -- whether the promoted employee currently has a supervisor at all, and
  -- whether that matches who actually submitted the promotion (it may
  -- legitimately not — HR/Executive can submit on anyone's behalf, or the
  -- supervisor may have changed since). site_id is then backfilled off the
  -- new employee_user_id FK, not the fragile company_id text match.
  ---------------------------------------------------------------------------
  alter table promotions add column if not exists employee_user_id uuid references users(user_id);
  alter table promotions add column if not exists supervisor_id uuid references users(user_id);
  alter table promotions add column if not exists site_id integer references sites(id);

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'company_id'
  ) then
    update promotions p
    set employee_user_id = u.user_id,
        supervisor_id = u.supervisor_id
    from users u
    where u.company_id = p.employee_company_id
      and p.employee_user_id is null;
  else
    raise notice 'promotions: users.company_id does not exist — could not attempt employee_company_id match at all';
  end if;

  update promotions p
  set site_id = u.site_id
  from users u
  where u.user_id = p.employee_user_id
    and p.site_id is null;

  select count(*) into unmatched_count from promotions where employee_user_id is null;
  raise notice 'promotions: % row(s) could not be matched to a real employee account via employee_company_id — no employee_user_id, supervisor_id, or site_id could be resolved for these.', unmatched_count;

  select count(*) into unmatched_count from promotions where employee_user_id is not null and supervisor_id is null;
  raise notice 'promotions: % row(s) matched to a real employee account that currently has NO supervisor_id set at all — worth reviewing.', unmatched_count;

  select count(*) into unmatched_count
  from promotions
  where employee_user_id is not null and supervisor_id is not null and supervisor_id is distinct from submitted_by_user_id;
  raise notice 'promotions: % row(s) where the employee''s current supervisor differs from who actually submitted the promotion (can be normal — HR/Executive submitting on behalf, or a supervisor change since submission — but worth a quick look).', unmatched_count;
end $$;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER RUNNING: review exactly which rows were left unmatched (per the
-- notices above) before deciding whether to set these columns NOT NULL —
-- this script deliberately leaves them nullable, since forcing NOT NULL
-- now would either fail outright (if any row is unmatched) or silently
-- require picking an arbitrary site for rows with no real answer.
--
--   select id, employee_user_id, employee_name, review_quarter, review_year
--   from appraisals where site_id is null;
--
--   select id, user_id, leave_type, start_date
--   from leave_requests where site_id is null;
--
--   select id, employee_id, log_type, created_at
--   from skill_logs where site_id is null;
--
--   select id, employee_company_id, employee_name, created_at
--   from promotions where employee_user_id is null;
--
--   select id, employee_company_id, employee_name, submitted_by_user_id, supervisor_id
--   from promotions where employee_user_id is not null and supervisor_id is null;
--
--   select id, employee_company_id, employee_name, submitted_by_user_id, supervisor_id
--   from promotions
--   where employee_user_id is not null and supervisor_id is not null
--     and supervisor_id is distinct from submitted_by_user_id;
-- ============================================================================
