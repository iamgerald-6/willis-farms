-- ============================================================================
-- Careers — restore the Educational Certificates field's legacy_value and
-- rules.fieldKey (both blanked out, most likely by editing the label
-- through System Definitions with the "Field key" box left empty). Keeps
-- the current label as-is — only fixes the identifiers the app needs to
-- actually render and save this field.
-- ============================================================================

update system_options
set legacy_value = 'certificates',
    rules = jsonb_set(rules, '{fieldKey}', '"certificates"'::jsonb)
where id = 'opt:recruitment:field:cert';

NOTIFY pgrst, 'reload schema';

-- Confirm:
select id, legacy_value, label, is_active, rules
from system_options
where id = 'opt:recruitment:field:cert';
