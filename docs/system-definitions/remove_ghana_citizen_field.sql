-- ============================================================================
-- Careers — remove the "Ghana citizen?" application field. Whether the
-- Ghana Card or Passport fields show is now derived from the Nationality
-- field instead (nationality = "Ghana" -> Ghana Card; anything else ->
-- Passport), so a separate yes/no question is no longer needed.
--
-- Run in Supabase SQL editor after docs/system-definitions/recruitment.sql
-- and docs/system-definitions/nationality_select.sql.
-- ============================================================================

-- Deactivate rather than delete — is_active = false removes it from the
-- rendered form (normalizeApplicationFields filters on is_active) while
-- keeping the row itself, same non-destructive approach as everywhere
-- else in this app.
update system_options
set is_active = false
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'is_citizen';

update system_options
set rules = jsonb_set(rules, '{showWhen}', '{"field":"nationality","equals":"Ghana"}'::jsonb)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'ghana_card_no';

update system_options
set rules = jsonb_set(rules, '{showWhen}', '{"field":"nationality","notEquals":"Ghana"}'::jsonb)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value in ('passport_number', 'passport_bio_page');

NOTIFY pgrst, 'reload schema';
