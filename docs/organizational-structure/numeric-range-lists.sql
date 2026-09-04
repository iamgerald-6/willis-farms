-- ============================================================================
-- Organizational structure — numeric range lists (Age, Salary, ...)
-- Run once in the Supabase SQL editor.
--
-- Adds an is_numeric_range flag to custom list types. When set, the Manage
-- screen swaps the usual "type a label" add-form for a "min / max"
-- generator that bulk-fills the list with one row per whole number in that
-- range — e.g. min 15, max 35 creates rows 15, 16, 17, ... 35. Retroactively
-- flags your existing Age and Salary lists so they pick this up immediately.
-- ============================================================================

alter table org_custom_list_types add column if not exists is_numeric_range boolean not null default false;

update org_custom_list_types
set is_numeric_range = true
where lower(label) in ('age', 'ages', 'salary', 'salaries');

notify pgrst, 'reload schema';
