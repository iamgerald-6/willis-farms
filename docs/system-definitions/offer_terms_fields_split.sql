-- ============================================================================
-- Careers — seed the new independent "Offer letter" field list
-- (careers.offerTermsFields) in System Definitions.
--
-- Background: the live Offer Terms modal used to reuse HR onboarding
-- Section O's field list (careers.onboardingHrFields), filtered down by a
-- hardcoded key list in code. It now has its own independent, admin-editable
-- field list, so HR can add/edit Offer Terms fields directly in System
-- Definitions without a code change. Section O's own list is untouched —
-- editing a field there still only affects the Onboarding tab, where the 20
-- offer-derived fields keep showing read-only exactly as before.
--
-- This script copies the CURRENT label/type/rules of those 20 fields from
-- careers.onboardingHrFields into new rows under careers.offerTermsFields,
-- so the new "Offer letter" section in System Definitions starts populated
-- instead of empty. It only duplicates field DEFINITIONS — no submitted
-- application or onboarding data is touched, moved, or duplicated (offer
-- values and onboarding values both continue to live in the same
-- onboarding_submissions.hr_data JSON blob, keyed by field key, as before).
--
-- Safe to re-run: ON CONFLICT on (module_id, option_list, legacy_value)
-- does nothing if a row already exists.
-- ============================================================================

insert into system_options (id, module_id, option_list, label, legacy_value, sort_order, is_active, rules)
select
  'opt:recruitment:offer:' || src.legacy_value,
  src.module_id,
  'careers.offerTermsFields',
  src.label,
  src.legacy_value,
  (
    row_number() over (
      order by array_position(
        ARRAY[
          'position_title', 'grade_level', 'salary_tier', 'salary_ghs', 'pay_frequency',
          'department', 'employment_type', 'work_location', 'reporting_to', 'start_date',
          'notice_period', 'working_hours', 'acceptance_deadline', 'basic_salary_ghs',
          'housing_allowance', 'medical_allowance', 'social_security_contribution',
          'income_tax', 'net_payable', 'hr_notes'
        ],
        src.legacy_value
      )
    ) - 1
  )::int,
  true,
  src.rules
from system_options src
where src.module_id = 'mod:recruitment'
  and src.option_list = 'careers.onboardingHrFields'
  and src.legacy_value = ANY(ARRAY[
    'position_title', 'grade_level', 'salary_tier', 'salary_ghs', 'pay_frequency',
    'department', 'employment_type', 'work_location', 'reporting_to', 'start_date',
    'notice_period', 'working_hours', 'acceptance_deadline', 'basic_salary_ghs',
    'housing_allowance', 'medical_allowance', 'social_security_contribution',
    'income_tax', 'net_payable', 'hr_notes'
  ])
on conflict (module_id, option_list, legacy_value) do nothing;

NOTIFY pgrst, 'reload schema';
