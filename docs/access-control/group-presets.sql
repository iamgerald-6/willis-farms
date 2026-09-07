-- Group permission presets (Phase 2)
-- Run in Supabase SQL editor after page-permission-actions.sql
--
-- Updated for the new 7-role system: group_key is now one row per role
-- (standard_role / executive_role / human_resource / supervisory_role /
-- system_administrator / consultant / super_admin) instead of the old
-- role-literal + grade-band keys (employees/managers/admins/grade_l1_l3/
-- grade_l4_l7). Re-run this file against an existing table to swap the
-- CHECK constraint over — any old rows under the previous keys are left in
-- place (harmless, just no longer read by the app) rather than deleted,
-- since there's no automatic way to know which new role should inherit an
-- old group's saved content.

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
    'standard_role',
    'executive_role',
    'human_resource',
    'supervisory_role',
    'system_administrator',
    'consultant',
    'super_admin'
  ));

COMMENT ON TABLE public.access_group_presets IS
  'Default permission matrix per role, one row per role in the 7-role system. Users on access_tier=standard inherit their role''s preset. Individual overrides use access_tier=delegated with page_permission_actions on users.';
