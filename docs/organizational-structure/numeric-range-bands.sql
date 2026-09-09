-- ============================================================================
-- Organizational structure — numeric range bands (e.g. Salary bands)
-- Run once in the Supabase SQL editor, after
-- docs/organizational-structure/numeric-range-lists.sql.
--
-- Adds a second mode for numeric-range lists. "digits" is the existing
-- behaviour (min/max fills one row per whole number, e.g. Age: 15, 16, 17,
-- ...). "bands" is new: each min/max pair is one row (e.g. "18-25", "1000-2000").
-- Retroactively switches your
-- existing Salary list to bands mode. Age stays on digits (see
-- age-digits-restore.sql).
-- ============================================================================

alter table org_custom_list_types
  add column if not exists numeric_range_mode text not null default 'digits';

update org_custom_list_types
set numeric_range_mode = 'bands'
where (
    lower(label) in ('salary', 'salaries')
    or table_name = 'custom_salary'
  )
  and is_numeric_range;

notify pgrst, 'reload schema';
