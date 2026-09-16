-- ============================================================================
-- Site-access foundation: headquarters flag on sites
-- Phase 3 of the multi-site access architecture — see
-- docs/SITE_ACCESS_ARCHITECTURE.md §2. Run ONCE in the Supabase SQL editor.
--
-- WHY: the confirmed rule is "everyone is locked to their own site, except
-- headquarters, which sees everything — regardless of role." That rule is
-- derived from WHERE a person is placed, not a separate manually-maintained
-- flag on each person — so there's no per-user column to keep in sync when
-- someone transfers. One site is marked headquarters; a person's own
-- site_id (already on users) is compared against it at read time by the new
-- getAuthorizedSiteIds/assertSiteAccess helpers (src/lib/siteAccess.ts).
--
-- At most one site can be headquarters at a time — enforced by the partial
-- unique index below, not just convention.
-- ============================================================================

alter table sites add column if not exists is_headquarters boolean not null default false;

create unique index if not exists sites_only_one_headquarters_idx
  on sites (is_headquarters)
  where is_headquarters;

notify pgrst, 'reload schema';

-- ============================================================================
-- After running: mark exactly one site as headquarters, e.g.:
--   update sites set is_headquarters = true where id = <headquarters site id>;
-- Until one site is marked, EVERY user is treated as SITE-scoped (nobody
-- sees all sites) — there's no fallback "if no HQ, allow everyone" behavior,
-- since that would be a silent over-grant rather than a safe default.
-- ============================================================================
