-- Checkbox permission matrix (view / add / edit / approve / review per module)
-- Run in Supabase SQL editor after docs/ACCESS_CONTROL_SUPABASE.md §1

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS page_permission_actions jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.users
SET page_permission_actions = COALESCE(page_permission_actions, '{}'::jsonb)
WHERE page_permission_actions IS NULL;
