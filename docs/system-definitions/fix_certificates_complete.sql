-- ============================================================================
-- Careers — restore the Educational Certificates field completely in one
-- shot (previous patches to fieldKey and step individually kept leaving
-- other properties, like fieldType and multiple, in whatever state an
-- admin-panel edit had left them). This replaces the whole rules object
-- with the known-correct version rather than patching one key at a time.
-- ============================================================================

update system_options
set legacy_value = 'certificates',
    rules = '{
      "step": "experience",
      "fieldKey": "certificates",
      "fieldType": "file",
      "required": true,
      "accept": ".pdf,image/*",
      "multiple": true
    }'::jsonb
where id = 'opt:recruitment:field:cert';

NOTIFY pgrst, 'reload schema';

select id, legacy_value, label, is_active, rules
from system_options
where id = 'opt:recruitment:field:cert';
