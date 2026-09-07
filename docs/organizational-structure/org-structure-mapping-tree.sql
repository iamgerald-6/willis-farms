-- ============================================================================
-- Org structure mapping set up — branching (tree) support
-- Run once in the Supabase SQL editor, after org-structure-mapping-generic.sql.
--
-- The generic version ordered every level with a single sequence number
-- (position), which only ever describes one straight line. That breaks the
-- moment two unrelated things both need to branch off the same level — e.g.
-- Salary and Age both ending at Position, independent of each other. A
-- single number can't express "these two are siblings with no relationship
-- to one another."
--
-- This adds a real parent_level_id to each level instead: every level
-- points directly at its own one parent (or null, for a top-level list like
-- Site). A level's ancestor chain is now found by walking parent_level_id
-- up, not by looking at everything before it in one list — so any number
-- of levels can share the same parent without being ordered relative to
-- each other at all. `position` is kept only as a display tie-breaker
-- (which order to list siblings in), not as anything that defines the
-- hierarchy anymore.
-- ============================================================================

alter table org_mapping_levels
  add column if not exists parent_level_id uuid references org_mapping_levels(id) on delete cascade;

create index if not exists org_mapping_levels_parent_idx on org_mapping_levels (parent_level_id);

notify pgrst, 'reload schema';
