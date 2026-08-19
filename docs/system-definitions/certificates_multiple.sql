-- ============================================================================
-- Careers — allow multiple files to be uploaded for the "Educational
-- Certificates" field.
--
-- Run in Supabase SQL editor after recruitment_application_fields_only.sql.
-- ============================================================================

update system_options
set rules = jsonb_set(rules, '{multiple}', 'true'::jsonb),
    label = 'Educational Certificates'
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'certificates';

NOTIFY pgrst, 'reload schema';
