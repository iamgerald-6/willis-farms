import type { ApiRequestUser } from "@/lib/apiRequestAuth";

/**
 * The single shared "which site(s) can this person see" rule — Phase 3 of
 * the multi-site access architecture (docs/SITE_ACCESS_ARCHITECTURE.md §2).
 *
 * The rule, as confirmed: everyone is locked to their own site, no matter
 * their role — Executive, HR, Super Admin included. The one exception is
 * headquarters: a person placed at the site marked `is_headquarters` sees
 * every site's data. This is deliberately independent of role — it's about
 * WHERE someone is placed (users.site_id → sites.is_headquarters), not
 * their job title. See docs/multi-site/add-headquarters-and-site-access-foundation.sql
 * for the schema this reads.
 *
 * Every module that needs to restrict data by site (Policies, SOPs, the
 * Calendar, Recruitment, promotions, leave, appraisals, dashboards,
 * exports, ...) should call these two functions rather than re-deriving
 * the rule itself — that's the whole point of centralizing it here.
 */

export type SiteAuthorization =
  | { scope: "ALL_SITES" }
  | { scope: "SITE"; siteId: number | null };

/**
 * Resolves a caller's site authorization from their already-loaded
 * ApiRequestUser (getApiRequestUser already joins sites.is_headquarters —
 * no extra DB call needed here).
 */
export function getAuthorizedSiteIds(user: ApiRequestUser): SiteAuthorization {
  if (user.is_headquarters_site) {
    return { scope: "ALL_SITES" };
  }
  return { scope: "SITE", siteId: user.site_id };
}

/**
 * Can this caller see/act on a record with the given site_id?
 *
 * - ALL_SITES callers (headquarters) can see anything, including records
 *   with a null site_id (e.g. legacy rows from before site_id existed).
 * - SITE-scoped callers can only see records that match their own site_id
 *   exactly. A record with a null site_id is NOT visible to a SITE-scoped
 *   caller — a missing site is treated as "not proven to be theirs", not
 *   "belongs to everyone" (see SITE_ACCESS_ARCHITECTURE.md §3.2's
 *   null-handling decision, applied consistently here).
 * - A SITE-scoped caller with no site_id of their own (unplaced/auth-only)
 *   can never match anything.
 */
export function assertSiteAccess(
  user: ApiRequestUser,
  recordSiteId: number | null | undefined,
): boolean {
  const authorization = getAuthorizedSiteIds(user);
  if (authorization.scope === "ALL_SITES") return true;
  if (authorization.siteId == null) return false;
  return recordSiteId != null && recordSiteId === authorization.siteId;
}

/**
 * Pulls `site_id` out of a Supabase nested-select join field, e.g.
 * `.select("job_postings(site_id)")`. Supabase's untyped client sometimes
 * infers these as an array even for a genuine to-one relationship (no
 * generated types in this project to tell it otherwise) — this normalizes
 * either shape so call sites don't need their own unsafe type casts.
 */
export function siteIdFromJoin(joined: unknown): number | null {
  const row = Array.isArray(joined) ? joined[0] : joined;
  return (row as { site_id?: number | null } | null | undefined)?.site_id ?? null;
}

/**
 * Convenience for building a Supabase filter over a list of records —
 * returns the caller's own site_id to filter a query by (`.eq("site_id",
 * siteId)`), or null when the caller is ALL_SITES and no filter should be
 * applied at all. Do not treat a null return as "no rows" — it means "don't
 * filter," the opposite.
 */
export function siteFilterValue(user: ApiRequestUser): number | null {
  const authorization = getAuthorizedSiteIds(user);
  return authorization.scope === "ALL_SITES" ? null : authorization.siteId;
}
