-- Fix: reference_1_email and reference_2_email had their `rules` column
-- overwritten by a generic options editor (requires_document/requires_reason
-- shape) that should never have been able to touch these rows. This wiped
-- fieldKey/fieldType/step/required, so normalizeApplicationFields() silently
-- dropped both fields from the public application form.
--
-- Restores the correct rules JSON for both rows, matching the app's own
-- defaults in src/lib/systemDefinitions/recruitmentDefaults.ts. Safe to run
-- even if only one of the two is actually broken — this just sets each row
-- back to its intended shape.

update system_options
set rules = jsonb_build_object(
  'step', 'documents',
  'fieldKey', 'reference_1_email',
  'fieldType', 'email',
  'required', true
)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'reference_1_email';

update system_options
set rules = jsonb_build_object(
  'step', 'documents',
  'fieldKey', 'reference_2_email',
  'fieldType', 'email',
  'required', true,
  'showWhen', jsonb_build_object('field', 'add_second_referee', 'equals', 'Yes')
)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'reference_2_email';

-- Verify:
-- select legacy_value, rules from system_options
-- where module_id = 'mod:recruitment' and option_list = 'careers.applicationFields'
-- and legacy_value in ('reference_1_email', 'reference_2_email');
