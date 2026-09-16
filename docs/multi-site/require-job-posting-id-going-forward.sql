-- ============================================================================
-- Require job_applications.job_posting_id going forward (no new nulls)
-- Phase 3 of the multi-site access architecture — see
-- docs/SITE_ACCESS_ARCHITECTURE.md §3.2. Run ONCE in the Supabase SQL editor.
--
-- WHY: job_posting_id is how an application's site gets resolved (via
-- job_postings.site_id). Existing rows with a null job_posting_id are
-- accepted as old/legacy data and are deliberately left alone — this is
-- NOT a backfill. Going forward, no new row should ever be created with it
-- null.
--
-- HOW: a plain "alter column ... set not null" would fail outright (or
-- require touching/validating every existing row) because old null rows
-- already exist. Instead this adds a CHECK constraint with NOT VALID —
-- Postgres skips validating existing rows against it, but still enforces
-- it on every INSERT and UPDATE from this point on. Confirmed via code
-- read that the current application-save flow
-- (src/app/api/careers/applications/save/route.ts) already always sets
-- job_posting_id on insert — this constraint is a database-level
-- backstop for that, not a fix to a currently-broken path.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'job_applications_job_posting_id_required'
  ) then
    alter table job_applications
      add constraint job_applications_job_posting_id_required
      check (job_posting_id is not null) not valid;
    raise notice 'job_applications_job_posting_id_required added — enforced on all new inserts/updates, existing rows left untouched.';
  else
    raise notice 'job_applications_job_posting_id_required already exists — nothing to do.';
  end if;
end $$;

notify pgrst, 'reload schema';

-- ============================================================================
-- Reference: how many existing rows are grandfathered under this (informational only):
--   select count(*) from job_applications where job_posting_id is null;
-- ============================================================================
