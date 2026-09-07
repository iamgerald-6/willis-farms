-- ============================================================================
-- Fix: "User Status" list showing "Add User Statu"
-- Run once in the Supabase SQL editor.
--
-- Custom lists used to guess a singular form for their "Add ___" button by
-- stripping a trailing "s" off the list name. That guess is wrong for any
-- name that already ends in "s" without being plural — "User Status" became
-- "User Statu". The app no longer guesses (the singular now always matches
-- the list name exactly), but the "User Status" list was created before
-- that fix, so its stored value is still wrong. This corrects it.
-- ============================================================================

update org_custom_list_types
set singular = label
where label = 'User Status' and singular <> label;

notify pgrst, 'reload schema';
