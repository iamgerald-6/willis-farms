-- Soft-archive for policy manuals — mirrors content.archived_at on SOPs.
-- Run against Supabase, then: notify pgrst, 'reload schema';

alter table manuals
  add column if not exists archived_at timestamptz;

create index if not exists manuals_archived_at_idx on manuals (archived_at);

-- Extend audit log actions (drop/recreate check — safe if table is new/empty).
alter table policy_audit_log drop constraint if exists policy_audit_log_action_check;

alter table policy_audit_log
  add constraint policy_audit_log_action_check
  check (action in ('added', 'version_added', 'edited', 'archived', 'restored', 'deleted'));

notify pgrst, 'reload schema';
