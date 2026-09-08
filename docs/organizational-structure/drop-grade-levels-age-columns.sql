-- ============================================================================
-- Grade levels catalog — drop age_min / age_max
--
-- Age eligibility lives on the job posting (the Age org-structure list /
-- custom_age, including age_id / age_min_id / age_max_id). It does not
-- belong on a grade. Run once in the Supabase SQL editor after
-- grade-levels-catalog-fields.sql.
-- ============================================================================

-- Unregister Min age / Max age from the Grade levels list in Set up so
-- those fields disappear from Organizational structure > Grade levels.
update org_custom_list_types
set fields = '[
  {"key": "rank", "label": "Rank (ordering, 0 = consultant)", "type": "number"},
  {"key": "role_kind", "label": "Role kind", "type": "select", "options": ["ranked", "consultant"]}
]'::jsonb
where table_name = 'grade_levels';

alter table grade_levels drop column if exists age_min;
alter table grade_levels drop column if exists age_max;

notify pgrst, 'reload schema';
