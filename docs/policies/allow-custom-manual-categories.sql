-- ── Allow custom manual categories (Policies & Ops) ─────────────────────
-- The `manuals` table has a check constraint (manuals_category_check) that
-- only permits a fixed set of categories (HR, Biosecurity, Finance
-- Policies, Breeding Operations). The Upload Manual form's own UI text
-- says "Pick an existing one or type a new category" — promising freeform
-- categories — but the constraint blocks anything outside that fixed set,
-- so uploading with a new category (e.g. "Fire Service") fails with:
--   new row for relation "manuals" violates check constraint
--   "manuals_category_check"
--
-- This drops the constraint so custom categories actually work, matching
-- what the UI already tells users they can do. Safe/additive in effect —
-- it only relaxes a restriction, it doesn't touch or remove any existing
-- rows or columns.

alter table manuals drop constraint if exists manuals_category_check;
