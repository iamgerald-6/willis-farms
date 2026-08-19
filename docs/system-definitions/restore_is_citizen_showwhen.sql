-- ============================================================================
-- Careers — revert Ghana Card / Passport visibility back to keying off
-- is_citizen (as it worked originally), not Nationality directly.
--
-- is_citizen stays deactivated (is_active = false, set by
-- remove_ghana_citizen_field.sql) so it's never asked on the form — but the
-- application now auto-fills its value from Nationality on the client
-- (JobApplicationWizard's setFieldValue), so the original equals-based
-- showWhen rules below work unchanged.
--
-- Run in Supabase SQL editor after recruitment_application_fields_only.sql.
-- ============================================================================

update system_options
set rules = jsonb_set(rules, '{showWhen}', '{"field":"is_citizen","equals":"Yes"}'::jsonb)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'ghana_card_no';

update system_options
set rules = jsonb_set(rules, '{showWhen}', '{"field":"is_citizen","equals":"No"}'::jsonb)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value in ('passport_number', 'passport_bio_page');

-- Confirm is_citizen itself is still deactivated (should already be, from
-- remove_ghana_citizen_field.sql — this is just a safety no-op if so).
update system_options
set is_active = false
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'is_citizen';

NOTIFY pgrst, 'reload schema';
