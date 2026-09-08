-- ============================================================================
-- Grade levels catalog — make it the real source of truth for grade
-- definitions, retiring the old code-only, config-blob-driven grade system
-- in src/lib/systemDefinitions/gradeLevelsConfig.ts (DEFAULT_GRADE_LEVELS /
-- DEFAULT_CONSULTANT_GRADES, sourced from an admin-inaccessible JSON blob
-- under System Definitions > Recruitment business logic that nothing ever
-- actually wrote to).
--
-- From now on, the app reads grade definitions from THIS table — the same
-- Organizational Structure catalog already used for appraisal grade
-- templates, job postings, and each employee's own org placement — instead
-- of a hardcoded list disconnected from the rest of the org structure.
--
-- IMPORTANT: this version is checkpointed. When you paste a multi-statement
-- script into the Supabase SQL editor, Postgres runs the whole thing as ONE
-- implicit transaction — if any later statement errors, EVERYTHING before
-- it (including the ALTER TABLE that adds these columns) gets rolled back
-- silently. That is what happened the first time this file was run: the
-- columns never actually landed even though the ADD COLUMN statement itself
-- is harmless. This version inserts explicit `commit;` checkpoints after
-- each step, and wraps the data-touching steps in DO blocks that catch
-- their own errors (RAISE NOTICE instead of aborting), so a problem in a
-- later step can never again undo the columns added in step 1.
--
-- Run once in the Supabase SQL editor, then:
--   NOTIFY pgrst, 'reload schema';
-- If any step logs a NOTICE with an error, paste it back — that step can be
-- fixed and re-run on its own; everything else already committed is safe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: extra columns needed to fully describe a grade (rank for ordering
-- / "who outranks whom", ranked-vs-consultant kind, and the HR age band
-- used for shortlisting — all previously hardcoded in gradeLevelsConfig.ts).
-- ----------------------------------------------------------------------------
alter table grade_levels
  add column if not exists rank int,
  add column if not exists role_kind text not null default 'ranked'
    check (role_kind in ('ranked', 'consultant')),
  add column if not exists age_min int,
  add column if not exists age_max int;

commit;

-- ----------------------------------------------------------------------------
-- Step 2: register these as admin-editable custom fields on the "Grade
-- levels" list type, so Set up > Organizational Structure > Grade levels
-- shows and lets admins edit them the same way any other list's fields
-- work. Non-fatal if org_custom_list_types / this row doesn't exist yet.
-- ----------------------------------------------------------------------------
do $$
begin
  update org_custom_list_types
  set fields = '[
    {"key": "rank", "label": "Rank (ordering, 0 = consultant)", "type": "number"},
    {"key": "role_kind", "label": "Role kind", "type": "select", "options": ["ranked", "consultant"]},
    {"key": "age_min", "label": "Min age", "type": "number"},
    {"key": "age_max", "label": "Max age", "type": "number"}
  ]'::jsonb
  where table_name = 'grade_levels';
exception when others then
  raise notice 'Step 2 (register custom fields on org_custom_list_types) failed: %', sqlerrm;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Step 3: seed the 8 default grades if the table is empty of them — codes
-- match the values already stored on users.grade_level / job_postings so
-- existing text-grade data keeps resolving to the same definitions.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into grade_levels (label, code, sort_order, is_active, rank, role_kind, age_min, age_max)
  values
    ('Junior (1)',        'L1',         0, true, 1, 'ranked',     22, 33),
    ('Technician (2)',    'L2',         1, true, 2, 'ranked',     22, 33),
    ('Senior (3)',        'L3',         2, true, 3, 'ranked',     25, 40),
    ('Supervisor (4)',    'L4',         3, true, 4, 'ranked',     25, 40),
    ('Asst. Manager (5)', 'L5',         4, true, 5, 'ranked',     25, 40),
    ('Farm Manager (6)',  'L6',         5, true, 6, 'ranked',     33, 55),
    ('Operations (7)',    'L7',         6, true, 7, 'ranked',     33, 55),
    ('Consultant',        'consultant', 7, true, 0, 'consultant', 25, 55)
  on conflict (code) do nothing;
exception when others then
  raise notice 'Step 3 (seed default grades) failed: %', sqlerrm;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Step 4: backfill rank/role_kind/age_min/age_max on any pre-existing rows
-- that match these 8 known codes but predate these columns (no-op if the
-- insert above created them just now, since it already sets those values;
-- only matters if the row already existed from before).
-- ----------------------------------------------------------------------------
do $$
begin
  update grade_levels set rank = 1, role_kind = 'ranked', age_min = coalesce(age_min, 22), age_max = coalesce(age_max, 33) where code = 'L1' and rank is null;
  update grade_levels set rank = 2, role_kind = 'ranked', age_min = coalesce(age_min, 22), age_max = coalesce(age_max, 33) where code = 'L2' and rank is null;
  update grade_levels set rank = 3, role_kind = 'ranked', age_min = coalesce(age_min, 25), age_max = coalesce(age_max, 40) where code = 'L3' and rank is null;
  update grade_levels set rank = 4, role_kind = 'ranked', age_min = coalesce(age_min, 25), age_max = coalesce(age_max, 40) where code = 'L4' and rank is null;
  update grade_levels set rank = 5, role_kind = 'ranked', age_min = coalesce(age_min, 25), age_max = coalesce(age_max, 40) where code = 'L5' and rank is null;
  update grade_levels set rank = 6, role_kind = 'ranked', age_min = coalesce(age_min, 33), age_max = coalesce(age_max, 55) where code = 'L6' and rank is null;
  update grade_levels set rank = 7, role_kind = 'ranked', age_min = coalesce(age_min, 33), age_max = coalesce(age_max, 55) where code = 'L7' and rank is null;
  update grade_levels set rank = 0, role_kind = 'consultant', age_min = coalesce(age_min, 25), age_max = coalesce(age_max, 55) where code = 'consultant' and rank is null;
exception when others then
  raise notice 'Step 4 (backfill known-code rows) failed: %', sqlerrm;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Step 5: any OTHER pre-existing custom grade row (admin-added, not one of
-- the 8 above) that has no rank yet: default it to ranked with the next
-- rank after the highest known ranked grade, so it still sorts/functions
-- sensibly instead of being treated as rank 0 (consultant). Then enforce
-- NOT NULL / default and create the lookup index.
-- ----------------------------------------------------------------------------
do $$
begin
  update grade_levels
  set role_kind = 'ranked', rank = coalesce(rank, (select coalesce(max(rank), 7) + 1 from grade_levels where role_kind = 'ranked'))
  where rank is null and lower(code) not in ('consultant') and code !~* '_consultant$';

  update grade_levels
  set role_kind = 'consultant', rank = 0
  where rank is null;
exception when others then
  raise notice 'Step 5 (backfill other rows) failed: %', sqlerrm;
end $$;

commit;

do $$
begin
  alter table grade_levels alter column rank set not null;
  alter table grade_levels alter column rank set default 0;
exception when others then
  raise notice 'Step 5b (enforce rank not null/default) failed: % — check for remaining null ranks with: select id, label, code from grade_levels where rank is null;', sqlerrm;
end $$;

create index if not exists grade_levels_role_kind_rank_idx
  on grade_levels (role_kind, rank);

commit;

-- ----------------------------------------------------------------------------
-- Step 6: backfill users.grade_level_id from the existing free-text
-- users.grade_level, matching case-insensitively against this table's
-- `code` — only where grade_level_id isn't already set. Safe to run more
-- than once.
-- ----------------------------------------------------------------------------
do $$
begin
  update users u
  set grade_level_id = gl.id
  from grade_levels gl
  where u.grade_level_id is null
    and u.grade_level is not null
    and lower(trim(u.grade_level)) = lower(gl.code);
exception when others then
  raise notice 'Step 6 (backfill users.grade_level_id) failed: %', sqlerrm;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Step 7: same backfill for job_postings, in case any posting has a
-- text-only legacy grade reference and no grade_level_id yet (most already
-- have grade_level_id set directly by Create job posting).
-- ----------------------------------------------------------------------------
do $$
begin
  update job_postings jp
  set grade_level_id = gl.id
  from grade_levels gl
  where jp.grade_level_id is null
    and jp.interview_guide_key is not null
    and lower(trim(jp.interview_guide_key)) = lower(gl.code);
exception when others then
  raise notice 'Step 7 (backfill job_postings.grade_level_id) failed: %', sqlerrm;
end $$;

commit;

notify pgrst, 'reload schema';
