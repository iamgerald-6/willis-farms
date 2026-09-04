-- Merge the 5 fixed Organizational Structure lists (Sites, Business units,
-- Departments / divisions, Sections, Grade levels) into the same
-- org_custom_list_types / physical-table system that custom lists use, so
-- there's no special-casing between "fixed" and "custom" lists anywhere in
-- the app anymore.
--
-- This is purely a registry change — the underlying tables (sites,
-- business_units, departments, sections, grade_levels) are NOT renamed and
-- NOT touched. Existing data in them is safe.
--
-- Two things happen:
--   1. Each of the 5 tables gets a row in org_custom_list_types pointing at
--      its EXISTING table (table_name = the real table name — no new table
--      is created).
--   2. Any org_mapping_groups row that referenced a list by the OLD
--      encoding is rewritten to the new plain-id encoding:
--        - old fixed keys ("sites", "business-units", "departments",
--          "sections", "grade-levels") -> the new org_custom_list_types id
--        - old custom-list encoding ("custom:<uuid>") -> just "<uuid>"
--      From now on, parent_list_key/child_list_key are always a plain
--      org_custom_list_types.id — no prefix, no fixed-vs-custom branching.
--
-- Existing mapping data (the rows inside each mapping group's own table)
-- is untouched; only the parent_list_key/child_list_key text values on
-- org_mapping_groups change. Safe to run more than once.

do $$
declare
  v_sites_id uuid;
  v_business_units_id uuid;
  v_departments_id uuid;
  v_sections_id uuid;
  v_grade_levels_id uuid;
begin
  if not exists (select 1 from org_custom_list_types where table_name = 'sites') then
    insert into org_custom_list_types
      (label, singular, code, table_name, has_region, is_numeric_range, numeric_range_mode, fields, sort_order)
    values
      ('Sites', 'site', 'sites', 'sites', true, false, 'digits', '[]'::jsonb, 0)
    returning id into v_sites_id;
  else
    select id into v_sites_id from org_custom_list_types where table_name = 'sites';
  end if;

  if not exists (select 1 from org_custom_list_types where table_name = 'business_units') then
    insert into org_custom_list_types
      (label, singular, code, table_name, has_region, is_numeric_range, numeric_range_mode, fields, sort_order)
    values
      ('Business units', 'business unit', 'business_units', 'business_units', false, false, 'digits', '[]'::jsonb, 1)
    returning id into v_business_units_id;
  else
    select id into v_business_units_id from org_custom_list_types where table_name = 'business_units';
  end if;

  if not exists (select 1 from org_custom_list_types where table_name = 'departments') then
    insert into org_custom_list_types
      (label, singular, code, table_name, has_region, is_numeric_range, numeric_range_mode, fields, sort_order)
    values
      ('Departments / divisions', 'department', 'departments', 'departments', false, false, 'digits', '[]'::jsonb, 2)
    returning id into v_departments_id;
  else
    select id into v_departments_id from org_custom_list_types where table_name = 'departments';
  end if;

  if not exists (select 1 from org_custom_list_types where table_name = 'sections') then
    insert into org_custom_list_types
      (label, singular, code, table_name, has_region, is_numeric_range, numeric_range_mode, fields, sort_order)
    values
      ('Sections', 'section', 'sections', 'sections', false, false, 'digits', '[]'::jsonb, 3)
    returning id into v_sections_id;
  else
    select id into v_sections_id from org_custom_list_types where table_name = 'sections';
  end if;

  if not exists (select 1 from org_custom_list_types where table_name = 'grade_levels') then
    insert into org_custom_list_types
      (label, singular, code, table_name, has_region, is_numeric_range, numeric_range_mode, fields, sort_order)
    values
      ('Grade levels', 'grade level', 'grade_levels', 'grade_levels', false, false, 'digits', '[]'::jsonb, 4)
    returning id into v_grade_levels_id;
  else
    select id into v_grade_levels_id from org_custom_list_types where table_name = 'grade_levels';
  end if;

  -- Remap old fixed keys to the new plain-id encoding.
  update org_mapping_groups set parent_list_key = v_sites_id::text where parent_list_key = 'sites';
  update org_mapping_groups set child_list_key = v_sites_id::text where child_list_key = 'sites';

  update org_mapping_groups set parent_list_key = v_business_units_id::text where parent_list_key = 'business-units';
  update org_mapping_groups set child_list_key = v_business_units_id::text where child_list_key = 'business-units';

  update org_mapping_groups set parent_list_key = v_departments_id::text where parent_list_key = 'departments';
  update org_mapping_groups set child_list_key = v_departments_id::text where child_list_key = 'departments';

  update org_mapping_groups set parent_list_key = v_sections_id::text where parent_list_key = 'sections';
  update org_mapping_groups set child_list_key = v_sections_id::text where child_list_key = 'sections';

  update org_mapping_groups set parent_list_key = v_grade_levels_id::text where parent_list_key = 'grade-levels';
  update org_mapping_groups set child_list_key = v_grade_levels_id::text where child_list_key = 'grade-levels';

  -- Strip the old "custom:" prefix from any group that already referenced
  -- a custom list — the prefix scheme is retired now that every list
  -- (fixed or custom) lives in org_custom_list_types.
  update org_mapping_groups set parent_list_key = substring(parent_list_key from 8) where parent_list_key like 'custom:%';
  update org_mapping_groups set child_list_key = substring(child_list_key from 8) where child_list_key like 'custom:%';
end $$;
