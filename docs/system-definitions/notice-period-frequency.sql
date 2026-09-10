-- Seed notice period frequency options + Offer / Section O field definitions.
-- Safe to re-run (ON CONFLICT DO NOTHING).

-- Frequency unit choices (Day(s), Week(s), Month(s))
insert into system_options (id, module_id, option_list, label, legacy_value, sort_order, is_active, rules)
values
  ('opt:recruitment:notice:days', 'mod:recruitment', 'careers.noticePeriodFrequencies', 'Day(s)', 'Day(s)', 0, true, '{}'::jsonb),
  ('opt:recruitment:notice:weeks', 'mod:recruitment', 'careers.noticePeriodFrequencies', 'Week(s)', 'Week(s)', 1, true, '{}'::jsonb),
  ('opt:recruitment:notice:months', 'mod:recruitment', 'careers.noticePeriodFrequencies', 'Month(s)', 'Month(s)', 2, true, '{}'::jsonb)
on conflict (id) do nothing;

-- Offer letter field (if not already added via System Definitions UI)
insert into system_options (id, module_id, option_list, label, legacy_value, sort_order, is_active, rules)
values (
  'opt:recruitment:offer:notice_period_frequency',
  'mod:recruitment',
  'careers.offerTermsFields',
  'Notice period frequency',
  'notice_period_frequency',
  10,
  true,
  '{"fieldKey":"notice_period_frequency","fieldType":"notice_period_frequency","group":"hr","required":true,"hint":"Unit for the notice period — e.g. \"Week(s)\"."}'::jsonb
)
on conflict (module_id, option_list, legacy_value) do nothing;

-- Section O HR field
insert into system_options (id, module_id, option_list, label, legacy_value, sort_order, is_active, rules)
values (
  'opt:recruitment:hr:notice_period_frequency',
  'mod:recruitment',
  'careers.onboardingHrFields',
  'Notice period frequency',
  'notice_period_frequency',
  19,
  true,
  '{"fieldKey":"notice_period_frequency","fieldType":"notice_period_frequency","group":"hr","required":true,"hint":"Unit for the notice period — e.g. \"Week(s)\"."}'::jsonb
)
on conflict (module_id, option_list, legacy_value) do nothing;

notify pgrst, 'reload schema';
