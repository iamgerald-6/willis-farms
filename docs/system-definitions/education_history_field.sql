-- ============================================================================
-- Careers — switch "Educational qualifications" from a free-text textarea
-- to a repeatable list (institution type, institution name, year started,
-- year completed, degree/qualification if applicable). Stored as a JSON
-- array under the same education field key.
--
-- Run in Supabase SQL editor after recruitment_application_fields_only.sql.
-- ============================================================================

update system_options
set rules = jsonb_set(rules, '{fieldType}', '"education_history"'::jsonb)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'education';

NOTIFY pgrst, 'reload schema';
