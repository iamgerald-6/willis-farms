-- ============================================================================
-- Drop users.grade_level (free text).
--
-- The two promotions RLS policies below still read that column. Rewrite
-- them first to use users.grade_level_id -> grade_levels.code, then drop
-- the column. Same rule as before: L4, L5, L6, L7 can view/create
-- promotions. No rank column required.
-- ============================================================================

alter table public.users drop constraint if exists users_grade_level_check;

drop policy if exists "l4_and_above_can_view_promotions" on public.promotions;
create policy "l4_and_above_can_view_promotions"
  on public.promotions
  for select
  using (
    exists (
      select 1
      from users
      join grade_levels on grade_levels.id = users.grade_level_id
      where users.user_id::text = auth.uid()::text
        and grade_levels.code in ('L4', 'L5', 'L6', 'L7')
    )
  );

drop policy if exists "l4_and_above_can_create_promotions" on public.promotions;
create policy "l4_and_above_can_create_promotions"
  on public.promotions
  for insert
  with check (
    exists (
      select 1
      from users
      join grade_levels on grade_levels.id = users.grade_level_id
      where users.user_id::text = auth.uid()::text
        and grade_levels.code in ('L4', 'L5', 'L6', 'L7')
    )
  );

commit;

alter table public.users drop column if exists grade_level;

notify pgrst, 'reload schema';
