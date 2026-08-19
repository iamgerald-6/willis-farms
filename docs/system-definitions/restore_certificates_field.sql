-- ============================================================================
-- Careers — restore the "Educational Certificates" application field.
-- It's missing entirely from system_options (not deactivated, not
-- corrupted — just absent), so insert it fresh with the current rules
-- (file upload, multiple files allowed).
-- ============================================================================

insert into system_options
  (id, module_id, option_list, label, legacy_value, sort_order, rules)
values
  ('opt:recruitment:field:cert', 'mod:recruitment', 'careers.applicationFields',
   'Educational Certificates', 'certificates', 22,
   '{"step":"experience","fieldKey":"certificates","fieldType":"file","required":true,"accept":".pdf,image/*","multiple":true}'::jsonb)
on conflict (module_id, option_list, legacy_value) do update
set label = excluded.label,
    rules = excluded.rules,
    is_active = true;

NOTIFY pgrst, 'reload schema';
