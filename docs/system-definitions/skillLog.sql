-- ============================================================================
-- System Definitions — Skill Log module (run after schema.sql)
-- Uses existing system_modules + system_options tables (no new tables).
-- ============================================================================

insert into system_modules (module_id, source, enabled, business_logic)
values ('mod:skill-log', 'override', true, '{}'::jsonb)
on conflict (module_id) do nothing;

-- Farm / work sections (employee assignment area)
insert into system_options
  (id, module_id, option_list, label, legacy_value, sort_order, rules)
values
  ('opt:skill-log:section:1', 'mod:skill-log', 'skillLog.sections', 'Breeding', 'Breeding', 1, '{}'::jsonb),
  ('opt:skill-log:section:2', 'mod:skill-log', 'skillLog.sections', 'Farrowing', 'Farrowing', 2, '{}'::jsonb),
  ('opt:skill-log:section:3', 'mod:skill-log', 'skillLog.sections', 'Weaning', 'Weaning', 3, '{}'::jsonb),
  ('opt:skill-log:section:4', 'mod:skill-log', 'skillLog.sections', 'Gestation', 'Gestation', 4, '{}'::jsonb),
  ('opt:skill-log:section:5', 'mod:skill-log', 'skillLog.sections', 'Nursery', 'Nursery', 5, '{}'::jsonb),
  ('opt:skill-log:section:6', 'mod:skill-log', 'skillLog.sections', 'Grower-Finisher', 'Grower-Finisher', 6, '{}'::jsonb),
  ('opt:skill-log:section:7', 'mod:skill-log', 'skillLog.sections', 'General', 'General', 7, '{}'::jsonb)
on conflict (id) do nothing;

-- Tier authorisation
insert into system_options
  (id, module_id, option_list, label, legacy_value, sort_order, rules)
values
  ('opt:skill-log:tier:0', 'mod:skill-log', 'skillLog.tierAuthorisations', 'None yet', 'None yet', 0, '{}'::jsonb),
  ('opt:skill-log:tier:1', 'mod:skill-log', 'skillLog.tierAuthorisations', 'GP', 'GP', 1, '{}'::jsonb),
  ('opt:skill-log:tier:2', 'mod:skill-log', 'skillLog.tierAuthorisations', 'PS', 'PS', 2, '{}'::jsonb),
  ('opt:skill-log:tier:3', 'mod:skill-log', 'skillLog.tierAuthorisations', 'External GGP semen handling', 'External GGP semen handling', 3, '{}'::jsonb)
on conflict (id) do nothing;

-- Review periods — update year labels annually or add new rows in System Definitions
insert into system_options
  (id, module_id, option_list, label, legacy_value, sort_order, rules)
values
  ('opt:skill-log:period:1', 'mod:skill-log', 'skillLog.reviewPeriods', 'Q1 2026', 'Q1 2026', 1, '{}'::jsonb),
  ('opt:skill-log:period:2', 'mod:skill-log', 'skillLog.reviewPeriods', 'Q2 2026', 'Q2 2026', 2, '{}'::jsonb),
  ('opt:skill-log:period:3', 'mod:skill-log', 'skillLog.reviewPeriods', 'Q3 2026', 'Q3 2026', 3, '{}'::jsonb),
  ('opt:skill-log:period:4', 'mod:skill-log', 'skillLog.reviewPeriods', 'Q4 2026', 'Q4 2026', 4, '{}'::jsonb)
on conflict (id) do nothing;

-- Skills log types (legacy_value must match Git competency templates)
insert into system_options
  (id, module_id, option_list, label, legacy_value, sort_order, rules)
values
  ('opt:skill-log:type:1', 'mod:skill-log', 'skillLog.types', 'GP Breeding & Farrowing (Integrated)', 'GP Breeding & Farrowing (Integrated)', 1, '{}'::jsonb),
  ('opt:skill-log:type:2', 'mod:skill-log', 'skillLog.types', 'Feed Preparation (L1-L3 Duty)', 'Feed Preparation (L1-L3 Duty)', 2, '{}'::jsonb),
  ('opt:skill-log:type:3', 'mod:skill-log', 'skillLog.types', 'Daily Barn Cleaning and Sanitation', 'Daily Barn Cleaning and Sanitation', 3, '{}'::jsonb),
  ('opt:skill-log:type:4', 'mod:skill-log', 'skillLog.types', 'Incoming Semen Receiving (Multiplication Farm)', 'Incoming Semen Receiving (Multiplication Farm)', 4, '{}'::jsonb),
  ('opt:skill-log:type:5', 'mod:skill-log', 'skillLog.types', 'Grower-Finisher (Multiplication Farm Output)', 'Grower-Finisher (Multiplication Farm Output)', 5, '{}'::jsonb)
on conflict (id) do nothing;
