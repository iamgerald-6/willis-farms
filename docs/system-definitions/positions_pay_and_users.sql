-- ============================================================================
-- Positions (HR fields), pay on pay_grades, users linked to org (step 3)
-- Run once in the Supabase SQL editor AFTER:
--   1. docs/system-definitions/org_structure.sql
--   2. docs/system-definitions/pay_grades.sql
--
-- Simplified model (agreed):
--   • Pay bands live on pay_grades (L4 = one global band), NOT per-position.
--   • HR rules (default grade, age range, etc.) live on positions directly.
--   • Each user holds ONE job via users.position_id + users.grade_id — no
--     user_positions junction table.
--
-- users.job_position and users.grade_level are NOT dropped here — kept for
-- backward compatibility until application code migrates to the new FKs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pay bands on pay_grades (blank until HR fills in)
-- ---------------------------------------------------------------------------
alter table pay_grades
  add column if not exists salary_min numeric(12, 2);

alter table pay_grades
  add column if not exists salary_mid numeric(12, 2);

alter table pay_grades
  add column if not exists salary_max numeric(12, 2);

alter table pay_grades
  add column if not exists currency text not null default 'GHS';

alter table pay_grades
  add column if not exists bonus_structure jsonb not null default '{}'::jsonb;

alter table pay_grades
  add column if not exists deduction_structure jsonb not null default '{}'::jsonb;

-- Versioned pay history per grade (same grade id, many rows over time).
-- Current band = the row where effective_to is null for that grade_id.
create table if not exists pay_grade_pay_history (
  id uuid primary key default gen_random_uuid(),
  grade_id text not null references pay_grades(id) on delete restrict,
  salary_min numeric(12, 2),
  salary_mid numeric(12, 2),
  salary_max numeric(12, 2),
  currency text not null default 'GHS',
  bonus_structure jsonb not null default '{}'::jsonb,
  deduction_structure jsonb not null default '{}'::jsonb,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pay_grade_pay_history_one_open_per_grade
  on pay_grade_pay_history (grade_id)
  where effective_to is null;

create index if not exists pay_grade_pay_history_grade_idx
  on pay_grade_pay_history (grade_id, effective_from desc);

drop trigger if exists pay_grade_pay_history_set_updated_at on pay_grade_pay_history;
create trigger pay_grade_pay_history_set_updated_at
  before update on pay_grade_pay_history
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. HR / job rules on positions (no separate position_details table)
-- ---------------------------------------------------------------------------
alter table positions
  add column if not exists default_grade_id text references pay_grades(id) on delete set null;

alter table positions
  add column if not exists min_grade_id text references pay_grades(id) on delete set null;

alter table positions
  add column if not exists max_grade_id text references pay_grades(id) on delete set null;

alter table positions
  add column if not exists age_min int;

alter table positions
  add column if not exists age_max int;

alter table positions
  add column if not exists employment_type text;

alter table positions
  add column if not exists headcount_cap int;

alter table positions
  add column if not exists is_shared_service boolean not null default false;

-- min_grade rank must be <= max_grade rank when both are set
create or replace function enforce_position_grade_range()
returns trigger as $$
declare
  min_rank int;
  max_rank int;
begin
  if new.min_grade_id is not null and new.max_grade_id is not null then
    select rank into min_rank from pay_grades where id = new.min_grade_id;
    select rank into max_rank from pay_grades where id = new.max_grade_id;
    if min_rank is null or max_rank is null then
      raise exception 'min_grade_id or max_grade_id references an unknown pay grade';
    end if;
    if min_rank > max_rank then
      raise exception 'position min_grade_id (rank %) cannot be above max_grade_id (rank %)',
        min_rank, max_rank;
    end if;
  end if;

  if new.default_grade_id is not null then
    select rank into min_rank from pay_grades where id = new.default_grade_id;
    if min_rank is null then
      raise exception 'default_grade_id % is not a valid pay grade', new.default_grade_id;
    end if;
    if new.min_grade_id is not null then
      select rank into max_rank from pay_grades where id = new.min_grade_id;
      if min_rank < max_rank then
        raise exception 'default_grade_id rank % is below position min_grade_id rank %',
          min_rank, max_rank;
      end if;
    end if;
    if new.max_grade_id is not null then
      select rank into max_rank from pay_grades where id = new.max_grade_id;
      if min_rank > max_rank then
        raise exception 'default_grade_id rank % is above position max_grade_id rank %',
          min_rank, max_rank;
      end if;
    end if;
  end if;

  if new.age_min is not null and new.age_max is not null and new.age_min > new.age_max then
    raise exception 'position age_min (%) cannot exceed age_max (%)', new.age_min, new.age_max;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists positions_grade_range_check on positions;
create trigger positions_grade_range_check
  before insert or update on positions
  for each row execute function enforce_position_grade_range();

-- ---------------------------------------------------------------------------
-- 3. Link users to org — one position + one grade per user
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists position_id text;

alter table public.users
  add column if not exists grade_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_position_id_fkey'
  ) then
    alter table public.users
      add constraint users_position_id_fkey
      foreign key (position_id) references positions(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_grade_id_fkey'
  ) then
    alter table public.users
      add constraint users_grade_id_fkey
      foreign key (grade_id) references pay_grades(id)
      on delete set null;
  end if;
end $$;

create index if not exists users_position_id_idx on public.users (position_id);
create index if not exists users_grade_id_idx on public.users (grade_id);

-- User's grade must fall within their position's min/max range when set
create or replace function enforce_user_grade_matches_position()
returns trigger as $$
declare
  pos_min text;
  pos_max text;
  user_rank int;
  min_rank int;
  max_rank int;
begin
  if new.grade_id is null or new.position_id is null then
    return new;
  end if;

  select min_grade_id, max_grade_id into pos_min, pos_max
  from positions
  where id = new.position_id;

  if not found then
    raise exception 'position_id % does not exist', new.position_id;
  end if;

  select rank into user_rank from pay_grades where id = new.grade_id;
  if user_rank is null then
    raise exception 'grade_id % is not a valid pay grade', new.grade_id;
  end if;

  if pos_min is not null then
    select rank into min_rank from pay_grades where id = pos_min;
    if user_rank < min_rank then
      raise exception 'user grade rank % is below position minimum (%)',
        user_rank, pos_min;
    end if;
  end if;

  if pos_max is not null then
    select rank into max_rank from pay_grades where id = pos_max;
    if user_rank > max_rank then
      raise exception 'user grade rank % is above position maximum (%)',
        user_rank, pos_max;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists users_grade_position_check on public.users;
create trigger users_grade_position_check
  before insert or update on public.users
  for each row execute function enforce_user_grade_matches_position();

-- ---------------------------------------------------------------------------
-- 4. Read helper — user with full org lineage + grade rank
-- ---------------------------------------------------------------------------
create or replace view users_with_org_context as
select
  u.user_id,
  u.email,
  u.first_name,
  u.last_name,
  u.supervisor_id,
  u.position_id,
  p.label as position_label,
  u.grade_id,
  pg.label as grade_label,
  pg.rank as grade_rank,
  d.id as department_id,
  d.label as department_label,
  s.id as section_id,
  s.label as section_label,
  st.id as site_id,
  st.label as site_label,
  bu.id as business_unit_id,
  bu.label as business_unit_label
from public.users u
left join positions p on p.id = u.position_id
left join pay_grades pg on pg.id = u.grade_id
left join departments d on d.id = p.department_id
left join sections s on s.id = p.section_id
left join sites st on st.id = d.site_id
left join business_units bu on bu.id = st.business_unit_id;

-- Extend audit log scope for pay history rows
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
  check (config_scope in (
    'business_logic', 'form_definition', 'option',
    'org_structure', 'pay_grade', 'pay_grade_history', 'user_assignment'
  ));

notify pgrst, 'reload schema';
