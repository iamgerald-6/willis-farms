-- ── Fix sop_audit_log.content_id type ───────────────────────────────────
-- The original docs/sop/sop-audit-log.sql assumed content.id is uuid
-- (matching docs/task-manager/supporting-tables.sql's reference schema).
-- That assumption was wrong for this project: content.id is actually a
-- plain integer, which made every insert into sop_audit_log fail with
-- "invalid input syntax for type uuid" (confirmed via terminal logs —
-- 0 rows ever made it into the table).
--
-- sop_audit_log is brand new and currently empty, so the safest fix is to
-- drop and recreate it with the correct column type. Nothing else
-- references this table yet (no FK, by design — see the original
-- migration's comments), so this is safe to run even with Gerald also on
-- the DB.
--
-- Run this AFTER docs/sop/sop-audit-log.sql. If you've already run this
-- once and it's still empty, it's safe to run again.

drop table if exists sop_audit_log;

create table sop_audit_log (
  id uuid primary key default gen_random_uuid(),

  -- bigint to match content.id's actual type in this project. Still
  -- deliberately NOT a foreign key to content(id) — a "deleted" entry has
  -- to survive the content row's own hard delete, and the title is
  -- snapshotted here too so history stays readable after the SOP is gone.
  content_id bigint not null,
  content_title text not null,

  action text not null check (action in ('added', 'edited', 'archived', 'restored', 'deleted')),

  performed_by uuid not null,
  performed_by_name text not null,
  performed_at timestamptz not null default now()
);

create index if not exists sop_audit_content_id_idx on sop_audit_log(content_id);
create index if not exists sop_audit_performed_at_idx on sop_audit_log(performed_at desc);
