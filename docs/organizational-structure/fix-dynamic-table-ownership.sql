-- ============================================================================
-- Fix: "must be owner of table ..." when creating/deleting lists or
-- mapping groups from the app.
-- Run once in the Supabase SQL editor.
--
-- The create/drop functions for custom lists and mapping groups were
-- created as plain (not SECURITY DEFINER) functions, so they run with the
-- privileges of whoever calls them. Tables created directly via the SQL
-- editor (like this migration itself) are owned by the `postgres` role —
-- but the app calls these functions over the API using the service-role
-- key, which is a different role, and Postgres requires DROP/ALTER TABLE
-- to be run by the table's owner (or a superuser). Marking these functions
-- SECURITY DEFINER makes them always run as the role that defined them
-- (postgres, since you're running this in the SQL editor), regardless of
-- who calls them — fixing both the delete-list and delete-mapping-group
-- actions in the app.
-- ============================================================================

alter function create_org_dynamic_list_table(text, boolean, jsonb) security definer set search_path = public;
alter function drop_org_dynamic_list_table(text) security definer set search_path = public;
alter function create_org_dynamic_mapping_table(text, text, text) security definer set search_path = public;
alter function drop_org_dynamic_mapping_table(text) security definer set search_path = public;

notify pgrst, 'reload schema';
