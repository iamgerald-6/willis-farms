-- ============================================================================
-- Careers — move "Curriculum vitae (CV)" from the Documents step to the
-- very first field on the Personal information step (Step 1), so the AI
-- CV auto-fill can run before the applicant starts typing anything.
-- ============================================================================

update system_options
set sort_order = 0,
    rules = jsonb_set(rules, '{step}', '"personal"'::jsonb)
where module_id = 'mod:recruitment'
  and option_list = 'careers.applicationFields'
  and legacy_value = 'cv';

NOTIFY pgrst, 'reload schema';
