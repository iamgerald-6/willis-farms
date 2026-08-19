-- ============================================================================
-- Careers — switch "Work experience" from a free-text textarea to a
-- repeatable list (place of work, job title, start/end month-year, or
-- "currently work here"). Stored as a JSON array under the same
-- work_experience field key.
--
-- Run in Supabase SQL editor after recruitment_application_fields_only.sql.
-- ============================================================================

update system_options
set rules = jsonb_set(rules, '{fieldType}', '"work_history"'::jsonb)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'work_experience';

NOTIFY pgrst, 'reload schema';
