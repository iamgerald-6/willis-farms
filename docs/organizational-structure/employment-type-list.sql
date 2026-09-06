-- ============================================================================
-- Organizational structure: "Employment types" list, for job postings
-- Run once in the Supabase SQL editor, AFTER
-- docs/organizational-structure/job-postings-org-fields.sql.
--
-- Employment type (Full-time, Part-time, Contract, ...) moves from a
-- free-text field on the Create job posting form to a real org-structure
-- list, same as Site, Department, Position, etc. — picked from a
-- dropdown, backed by a real foreign key column on job_postings
-- (employment_type_id -> custom_employment_type(id)), not typed in.
--
-- Seeded with the values already in use across existing postings so
-- nothing looks different at first; admins can rename, add, or remove
-- entries from Set up afterward like any other list.
-- ============================================================================

do $$
declare
  v_list_id uuid;
  v_next_sort int;
begin
  if exists (select 1 from org_custom_list_types where table_name = 'custom_employment_type') then
    raise notice 'Employment types list already exists, skipping.';
    return;
  end if;

  perform create_org_dynamic_list_table('custom_employment_type', false, '[]'::jsonb);
  perform add_job_posting_org_column('employment_type_id', 'custom_employment_type');

  select coalesce(max(sort_order), -1) + 1 into v_next_sort from org_custom_list_types;

  insert into org_custom_list_types
    (label, singular, code, table_name, has_region, is_numeric_range, numeric_range_mode, fields, sort_order, job_posting_column)
  values
    ('Employment types', 'Employment type', 'employment_types', 'custom_employment_type', false, false, 'digits', '[]'::jsonb, v_next_sort, 'employment_type_id')
  returning id into v_list_id;

  insert into custom_employment_type (label, code, sort_order, is_active)
  values
    ('Full-time', 'full_time', 0, true),
    ('Part-time', 'part_time', 1, true),
    ('Contract', 'contract', 2, true),
    ('Internship', 'internship', 3, true),
    ('Temporary', 'temporary', 4, true);
end $$;

notify pgrst, 'reload schema';
