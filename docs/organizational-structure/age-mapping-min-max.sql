-- ============================================================================
-- Org structure mapping — Age uses min/max catalog picks (not checkbox rows)
-- Run once after org_map_custom_age exists with a single age_id column, OR
-- after connecting Age under Position for the first time with the updated app.
--
-- Replaces age_id on org_map_custom_age with age_min_id + age_max_id, both FK
-- to custom_age. One row per Site → … → Position path.
--
-- If org_map_custom_age does not exist yet, skip this — the app creates the
-- correct shape when you Connect Age under Position.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'org_map_custom_age'
      and column_name = 'age_id'
  ) then
    alter table org_map_custom_age drop column if exists age_id;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'org_map_custom_age'
  ) then
    alter table org_map_custom_age
      add column if not exists age_min_id uuid references custom_age(id) on delete cascade,
      add column if not exists age_max_id uuid references custom_age(id) on delete cascade;

    delete from org_map_custom_age;

    update org_mapping_levels ml
    set mapping_columns = sub.cols
    from (
      select
        id,
        coalesce(
          (
            select array_agg(c order by ord)
            from (
              select c, row_number() over () as ord
              from unnest(mapping_columns) as c
              where c <> 'age_id'
            ) s
          ),
          '{}'::text[]
        ) || array['age_min_id', 'age_max_id'] as cols
      from org_mapping_levels
      where table_name = 'org_map_custom_age'
    ) sub
    where ml.id = sub.id
      and not ('age_min_id' = any(ml.mapping_columns));
  end if;
end $$;

notify pgrst, 'reload schema';
