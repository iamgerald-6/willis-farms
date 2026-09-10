-- ============================================================================
-- Leave requests — two-stage approval (supervisor, then HR/Executive sign-off)
-- Run once in the Supabase SQL editor.
--
-- What changes: leave_requests used to have a single approval step (any
-- eligible approver moved status straight from "pending" to "approved" /
-- "rejected"). Now there are two sequential steps, tracked by a new `stage`
-- column:
--   pending_supervisor  - waiting on the employee's assigned supervisor
--   pending_signoff     - supervisor approved; waiting on Human Resource or
--                         Executive Role (Executive Role only, if the
--                         applicant IS Human Resource or Executive Role)
--   approved            - final sign-off given
--   rejected            - rejected at either stage
--
-- The existing `status` column ("pending" | "approved" | "rejected") is kept
-- exactly as before for backward compatibility with every place that already
-- filters on it (leave balance calculations, the annual-cap check, the
-- admin page's filter tabs) — it just now stays "pending" through BOTH
-- stages, only flipping to "approved"/"rejected" once the request is fully
-- resolved.
--
-- The existing `reviewed_by` / `reviewed_at` / `admin_note` columns now mean
-- the FINAL sign-off (stage 2). New columns below capture the supervisor's
-- stage-1 decision separately.
-- ============================================================================

alter table leave_requests
  add column if not exists stage text not null default 'pending_supervisor',
  add column if not exists supervisor_reviewed_by uuid references users(user_id),
  add column if not exists supervisor_reviewed_at timestamptz,
  add column if not exists supervisor_note text;

alter table leave_requests
  add constraint if not exists leave_requests_stage_check
  check (stage in ('pending_supervisor', 'pending_signoff', 'approved', 'rejected'));

-- One-time backfill for rows that already exist: finished requests keep
-- their finished stage; anything still "pending" is placed at the stage the
-- new logic would have started it at — pending_supervisor if the employee
-- currently has a supervisor assigned, otherwise pending_signoff (same
-- "no supervisor set → go straight to sign-off" rule the app now applies to
-- new requests).
update leave_requests lr
set stage = case
  when lr.status = 'approved' then 'approved'
  when lr.status = 'rejected' then 'rejected'
  when u.supervisor_id is not null then 'pending_supervisor'
  else 'pending_signoff'
end
from users u
where u.user_id = lr.user_id;

notify pgrst, 'reload schema';
