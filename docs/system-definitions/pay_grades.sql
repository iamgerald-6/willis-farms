-- ============================================================================
-- Pay grades — rank/seniority catalog (foundation, step 2)
-- Run once in the Supabase SQL editor for the Wills Farms project.
--
-- Independent of the org tree (business_units/sites/departments/sections/
-- positions from org_structure.sql) — grade is a rank, not a place in the
-- tree. A position later references a grade (or a grade range); the org
-- tree never references a grade directly.
--
-- Structural facts (id, grade_type, rank) are seeded now, because a grade's
-- position on the seniority scale isn't optional — it's what makes rank
-- comparisons (supervisor eligibility, appraisal rating, promotion order)
-- possible at all. Meaning (label wording, description) is left generic for
-- HR to define. Salary bands are added in positions_pay_and_users.sql
-- (step 3) directly on pay_grades — one global band per grade, not per job.
--
-- Rank scale: L grades use 1, 2, 3… (add L8+ freely). E1/E2 use fixed band
-- 1001/1002 so executives always outrank every L without renumbering.
-- ============================================================================

create table if not exists pay_grades (
  id text primary key,
  grade_type text not null check (grade_type in ('standard', 'executive')),
  rank int not null unique,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists pay_grades_set_updated_at on pay_grades;
create trigger pay_grades_set_updated_at
  before update on pay_grades
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed L1–L7 (standard) and E1–E2 (executive). Labels default to the grade
-- id itself and description is left null — HR renames/describes these
-- later (System Definitions, once that layer is built). Nothing here
-- invents a meaning like "Supervisor" or "Farm Manager".
-- ---------------------------------------------------------------------------
insert into pay_grades (id, grade_type, rank, label, sort_order)
values
  ('L1', 'standard', 1, 'L1', 1),
  ('L2', 'standard', 2, 'L2', 2),
  ('L3', 'standard', 3, 'L3', 3),
  ('L4', 'standard', 4, 'L4', 4),
  ('L5', 'standard', 5, 'L5', 5),
  ('L6', 'standard', 6, 'L6', 6),
  ('L7', 'standard', 7, 'L7', 7),
  ('E1', 'executive', 1001, 'E1', 1001),
  ('E2', 'executive', 1002, 'E2', 1002)
on conflict (id) do nothing;

-- Allow the config-audit log to record grade changes too (same table used
-- for org_structure — see org_structure.sql step 6).
do $$
declare
  con record;
begin
  for con in
    select pgc.conname
    from pg_constraint pgc
    join pg_class rel on rel.oid = pgc.conrelid
    where rel.relname = 'system_config_audit_log'
      and pgc.contype = 'c'
      and pg_get_constraintdef(pgc.oid) ilike '%config_scope%'
  loop
    execute format('alter table system_config_audit_log drop constraint %I', con.conname);
  end loop;
end $$;

alter table system_config_audit_log
  add constraint system_config_audit_log_config_scope_check
  check (config_scope in ('business_logic', 'form_definition', 'option', 'org_structure', 'pay_grade'));

notify pgrst, 'reload schema';
