-- ============================================================================
-- System Definitions → User Management → Access control
-- Run once in the Supabase SQL editor. Backs the Access control page: the
-- main list of platform sidebar items (with an optional specific sub-menu
-- item, e.g. "Human Capital" + "Appraisal") and, per item, the list of
-- actions ("what you can do": Add, Approve, Edit, Review, View) chosen on
-- that item's Manage setup page.
--
-- access_control_items — one row per sidebar item added on the main Access
--   control page. sidebar_item is always a top-level sidebar label
--   (Overview, Human Capital, Task Manager, Operations, Notifications).
--   sidebar_submenu_item is null for a flat item (e.g. Overview) and set to
--   the chosen child label when the top-level item expands into its own
--   sub-menu (e.g. Human Capital > Appraisal). The two partial unique
--   indexes below stand in for a single unique(sidebar_item,
--   sidebar_submenu_item) constraint, since Postgres treats NULLs as
--   distinct from each other in a normal unique constraint and would
--   otherwise let "Overview" be added twice.
-- access_control_item_actions — the actions selected for one
--   access_control_items row, on that item's Manage setup page.
--
-- No Postgres RLS — same pattern as the rest of System Definitions /
-- Organizational Structure; Next.js API routes use the service-role key and
-- enforce access in code (see requireSystemDefinitionsAccess in
-- src/lib/apiRequestAuth.ts).
-- ============================================================================

create table if not exists access_control_items (
  id uuid primary key default gen_random_uuid(),
  sidebar_item text not null,
  sidebar_submenu_item text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists access_control_items_unique_flat_idx
  on access_control_items (sidebar_item)
  where sidebar_submenu_item is null;

create unique index if not exists access_control_items_unique_submenu_idx
  on access_control_items (sidebar_item, sidebar_submenu_item)
  where sidebar_submenu_item is not null;

create table if not exists access_control_item_actions (
  id uuid primary key default gen_random_uuid(),
  access_control_item_id uuid not null references access_control_items(id) on delete cascade,
  action_label text not null,
  created_at timestamptz not null default now(),
  unique (access_control_item_id, action_label)
);

create index if not exists access_control_item_actions_item_id_idx
  on access_control_item_actions (access_control_item_id);

-- Reuses the set_updated_at() function already created by
-- docs/organizational-structure/schema.sql — no need to redefine it here.
drop trigger if exists access_control_items_set_updated_at on access_control_items;
create trigger access_control_items_set_updated_at
  before update on access_control_items
  for each row execute function set_updated_at();

notify pgrst, 'reload schema';
