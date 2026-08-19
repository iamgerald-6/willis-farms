-- ============================================================================
-- Careers — force the "Ghana Card number" application field to the
-- GHA-XXXXXXXXX-X format (9 digits + 1 check digit) instead of free text.
--
-- The base seed (docs/system-definitions/recruitment.sql) already
-- inserted this field with fieldType "text" — this migration updates
-- that existing row in place rather than re-inserting it (the seed's
-- insert uses "on conflict (id) do nothing", so re-running it wouldn't
-- pick up this change).
--
-- Run in Supabase SQL editor after docs/system-definitions/recruitment.sql.
-- ============================================================================

update system_options
set rules = jsonb_set(rules, '{fieldType}', '"ghana_card"'::jsonb)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'ghana_card_no';

NOTIFY pgrst, 'reload schema';
