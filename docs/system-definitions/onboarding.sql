-- Onboarding form fields + dropdown lists for System Definitions (mod:recruitment)
-- Run in Supabase SQL editor after system_definitions/schema.sql

-- Work locations (farm sites)
INSERT INTO system_options (id, module_id, option_list, label, legacy_value, sort_order, is_active, rules)
VALUES
  ('opt:onboarding:loc:1', 'mod:recruitment', 'careers.onboardingLocations', 'Main Breeding Farm — Ashanti', 'main_breeding_ashanti', 0, true, '{}'),
  ('opt:onboarding:loc:2', 'mod:recruitment', 'careers.onboardingLocations', 'Grower-Finisher Site — Eastern', 'grower_eastern', 1, true, '{}'),
  ('opt:onboarding:loc:3', 'mod:recruitment', 'careers.onboardingLocations', 'Commercial Operations — Greater Accra', 'commercial_accra', 2, true, '{}'),
  ('opt:onboarding:loc:4', 'mod:recruitment', 'careers.onboardingLocations', 'Head Office — Accra', 'head_office', 3, true, '{}')
ON CONFLICT (id) DO NOTHING;

-- Departments L1–L6
INSERT INTO system_options (id, module_id, option_list, label, legacy_value, sort_order, is_active, rules)
VALUES
  ('opt:onboarding:dept:l16:1', 'mod:recruitment', 'careers.onboardingDepartmentsL1L6', 'Farm Operations', 'farm_operations', 0, true, '{}'),
  ('opt:onboarding:dept:l16:2', 'mod:recruitment', 'careers.onboardingDepartmentsL1L6', 'Breeding Operations', 'breeding_operations', 1, true, '{}')
ON CONFLICT (id) DO NOTHING;

-- Departments L7
INSERT INTO system_options (id, module_id, option_list, label, legacy_value, sort_order, is_active, rules)
VALUES
  ('opt:onboarding:dept:l7:1', 'mod:recruitment', 'careers.onboardingDepartmentsL7', 'Breeding Operations', 'breeding_operations', 0, true, '{}'),
  ('opt:onboarding:dept:l7:2', 'mod:recruitment', 'careers.onboardingDepartmentsL7', 'Commercial Operations', 'commercial_operations', 1, true, '{}'),
  ('opt:onboarding:dept:l7:3', 'mod:recruitment', 'careers.onboardingDepartmentsL7', 'Production', 'production', 2, true, '{}')
ON CONFLICT (id) DO NOTHING;

-- Form fields: see src/lib/systemDefinitions/onboardingDefaults.ts for the full seed.
-- Git fallbacks apply when DB rows are missing; run a full seed script if you need
-- HR-editable defaults in Supabase from day one.

-- Deactivate legacy single-field rows superseded by list editors (Aug 2026).
UPDATE system_options
SET is_active = false
WHERE module_id = 'mod:recruitment'
  AND option_list = 'careers.onboardingFields'
  AND id IN (
    'opt:onboarding:field:qual',
    'opt:onboarding:field:inst',
    'opt:onboarding:field:employer',
    'opt:onboarding:field:job_title',
    'opt:onboarding:field:skills',
    'opt:onboarding:field:ref1_name',
    'opt:onboarding:field:ref1_rel',
    'opt:onboarding:field:ref1_phone',
    'opt:onboarding:field:ref1_email',
    'opt:onboarding:field:ref2_name',
    'opt:onboarding:field:ref2_rel',
    'opt:onboarding:field:ref2_phone',
    'opt:onboarding:field:ref2_email'
  );
