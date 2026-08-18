-- Group permission presets (Phase 2)
-- Run in Supabase SQL editor after page-permission-actions.sql

CREATE TABLE IF NOT EXISTS public.access_group_presets (
  group_key text PRIMARY KEY,
  page_permission_actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  updated_by uuid
);

ALTER TABLE public.access_group_presets
  DROP CONSTRAINT IF EXISTS access_group_presets_group_key_check;

ALTER TABLE public.access_group_presets
  ADD CONSTRAINT access_group_presets_group_key_check
  CHECK (group_key IN (
    'employees',
    'managers',
    'admins',
    'grade_l1_l3',
    'grade_l4_l7'
  ));

COMMENT ON TABLE public.access_group_presets IS
  'Default permission matrix per role/grade group. Users on access_tier=standard inherit these (role + grade band merged). Individual overrides use access_tier=delegated with page_permission_actions on users.';
