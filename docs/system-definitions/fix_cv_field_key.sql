-- ============================================================================
-- Careers — the "Curriculum vitae (CV)" field's rules.fieldKey has been
-- wiped blank (same root cause as the earlier Ghana Card / Certificates
-- incidents: an edit made before the System Definitions editor's save
-- logic was fixed silently dropped this one property). A blank fieldKey
-- means normalizeApplicationFields() filters this field out of the public
-- application form entirely.
--
-- This restores just the fieldKey — everything else on the row (label,
-- step, sort_order, required, etc.) is left untouched.
-- ============================================================================

update system_options
set rules = jsonb_set(rules, '{fieldKey}', '"cv"'::jsonb)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'cv';

NOTIFY pgrst, 'reload schema';
