-- Add skill_variants column and backfill from legacy single `sections` array.
-- Run in Supabase SQL editor, then: NOTIFY pgrst, 'reload schema';

alter table skill_log_templates
  add column if not exists skill_variants jsonb not null default '[]'::jsonb;

update skill_log_templates
set skill_variants = jsonb_build_array(
  jsonb_build_object(
    'name', 'General',
    'sections', sections
  )
)
where jsonb_array_length(coalesce(skill_variants, '[]'::jsonb)) = 0
  and jsonb_array_length(coalesce(sections, '[]'::jsonb)) > 0;

notify pgrst, 'reload schema';
