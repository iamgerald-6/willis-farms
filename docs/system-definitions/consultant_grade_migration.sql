-- ============================================================================
-- Consultant grade + application field type renames
-- Run in Supabase SQL editor after deploying the app changes.
-- ============================================================================

-- 1. Allow "consultant" as interview_guide_key on job postings (if check exists)
alter table public.job_postings drop constraint if exists job_postings_interview_guide_key_check;

alter table public.job_postings
  add constraint job_postings_interview_guide_key_check
  check (interview_guide_key in (
    'L1','L2','L3','L4','L5','L6','L7',
    'consultant',
    'data_analyst','veterinarian'
  ));

-- 2. Rename application form field types (optional — git fallback already uses new names)
update public.system_options
set rules = jsonb_set(rules, '{fieldType}', '"work_fields"'::jsonb)
where option_list = 'careers.applicationFields'
  and rules->>'fieldType' = 'work_history';

update public.system_options
set rules = jsonb_set(rules, '{fieldType}', '"education_fields"'::jsonb)
where option_list = 'careers.applicationFields'
  and rules->>'fieldType' = 'education_history';

-- 3. Seed institution types if missing (safe no-op when rows already exist)
insert into public.system_options (
  id, module_id, option_list, label, legacy_value, sort_order, is_active, rules
)
select
  'opt:recruitment:inst:high_school',
  'mod:recruitment',
  'careers.institutionTypes',
  'High School',
  'High School',
  0,
  true,
  '{}'::jsonb
where not exists (
  select 1 from public.system_options
  where option_list = 'careers.institutionTypes'
);

-- 4. Drop legacy users.grade_level check (L1–L7 only) — grades are config-driven
alter table public.users drop constraint if exists users_grade_level_check;

notify pgrst, 'reload schema';
