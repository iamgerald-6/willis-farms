-- ============================================================================
-- System Definitions — Appraisal module (run after schema.sql)
-- Uses existing system_modules + system_options tables (no new tables).
-- ============================================================================

insert into system_modules (module_id, source, enabled, business_logic)
values (
  'mod:appraisal',
  'override',
  true,
  '{
    "sectionWeightRules": [
      {
        "id": "l4-leadership-weight",
        "label": "L4+ higher weight on Leadership section (Section A)",
        "minGradeIndex": 3,
        "sectionKey": "A",
        "weight": 0.25,
        "enabled": true
      }
    ]
  }'::jsonb
)
on conflict (module_id) do update
set business_logic = excluded.business_logic,
    updated_at = now();

-- Section authorisations dropdown (appraisal form header)
insert into system_options
  (id, module_id, option_list, label, legacy_value, sort_order, rules)
values
  ('opt:appraisal:auth:none', 'mod:appraisal', 'appraisal.sectionAuthorisations', 'None yet', 'None yet', 0, '{}'::jsonb),
  ('opt:appraisal:auth:farrowing', 'mod:appraisal', 'appraisal.sectionAuthorisations', 'Farrowing', 'Farrowing', 1, '{}'::jsonb),
  ('opt:appraisal:auth:weaning', 'mod:appraisal', 'appraisal.sectionAuthorisations', 'Weaning', 'Weaning', 2, '{}'::jsonb),
  ('opt:appraisal:auth:ai', 'mod:appraisal', 'appraisal.sectionAuthorisations', 'AI', 'AI', 3, '{}'::jsonb),
  ('opt:appraisal:auth:gestation', 'mod:appraisal', 'appraisal.sectionAuthorisations', 'Gestation', 'Gestation', 4, '{}'::jsonb),
  ('opt:appraisal:auth:nursery', 'mod:appraisal', 'appraisal.sectionAuthorisations', 'Nursery', 'Nursery', 5, '{}'::jsonb),
  ('opt:appraisal:auth:grower', 'mod:appraisal', 'appraisal.sectionAuthorisations', 'Grower-Finisher', 'Grower-Finisher', 6, '{}'::jsonb)
on conflict (id) do nothing;

-- Q1–Q3 appraisals do not use promotion_readiness (Annual / Q4 only)
alter table public.appraisals
  alter column promotion_readiness drop not null;
