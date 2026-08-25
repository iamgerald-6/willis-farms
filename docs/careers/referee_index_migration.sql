-- Extend referee slots from 2 to 5 (matches System Definitions → Job application form)
alter table public.referee_reference_tokens
  drop constraint if exists referee_reference_tokens_referee_index_check;

alter table public.referee_reference_tokens
  add constraint referee_reference_tokens_referee_index_check
  check (referee_index between 1 and 5);

alter table public.referee_reference_submissions
  drop constraint if exists referee_reference_submissions_referee_index_check;

alter table public.referee_reference_submissions
  add constraint referee_reference_submissions_referee_index_check
  check (referee_index between 1 and 5);

notify pgrst, 'reload schema';
