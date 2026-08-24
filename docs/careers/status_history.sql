-- Adds a status_history log to job_applications so status changes are
-- tracked over time (previously only the current status was stored, which
-- made it impossible to reconstruct e.g. "was this applicant ever
-- shortlisted" once they'd moved further along or been rejected). Every
-- status-changing code path now appends one entry here:
--   { "status": "...", "changed_at": "...", "changed_by": "..." | null }
-- Run this in the Supabase SQL editor.

alter table public.job_applications
  add column if not exists status_history jsonb not null default '[]'::jsonb;

-- Best-effort backfill for existing rows: seed a single entry reflecting
-- their current status, timestamped from updated_at (or created_at as a
-- fallback). This can't reconstruct genuine history for rows that already
-- moved through several statuses before this column existed — it's a
-- starting point, not a full audit trail, for anything created before now.
update public.job_applications
set status_history = jsonb_build_array(
  jsonb_build_object(
    'status', status,
    'changed_at', to_char(coalesce(updated_at, created_at) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'changed_by', null
  )
)
where status_history = '[]'::jsonb;
