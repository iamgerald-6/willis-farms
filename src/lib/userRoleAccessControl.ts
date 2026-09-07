import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * New role taxonomy, replacing users.role ("employee" | "manager" | "admin" |
 * "super_admin") as the source of truth for access control. Backed by the
 * "User role" custom org-structure list — users.user_role_id (see
 * docs/access-control/users-org-placement-user-role.sql) — a normal
 * user-editable list rather than a fixed DB enum, so role names are matched
 * case-insensitively by label instead of a hardcoded value set.
 *
 * The 7 roles and what each one means for access control:
 *   Standard              - same access as the old "employee".
 *   Executive             - same access as the old "manager" (full breadth,
 *                            unchanged — see isFullRoleAccess in
 *                            pagePermissions.ts).
 *   Consultant             - same access as Standard. Kept as its own label
 *                            because gradeLevelsConfig.ts already tracks
 *                            "Consultant" separately for other things
 *                            (program eligibility, salary tiers) — nothing
 *                            to do with access control.
 *   Human Resource         - full access to every Human Capital + Task
 *                            Manager page. No User Management / System
 *                            Definitions access by default.
 *   System Administrator   - System Definitions + User Management access.
 *                            Explicitly NOT granted appraise / approve leave
 *                            / fill skill log / create tasks for others —
 *                            deliberately narrower than "full role access".
 *   Supervisory             - replaces the old L4-L7 grade-rank threshold.
 *                            Not a broad grant by itself — combined with the
 *                            existing users.supervisor_id assignment (see
 *                            supervisorAssignment.ts), a Supervisory-role
 *                            person can appraise, approve leave for, fill
 *                            the skill log of, and create tasks for
 *                            whoever's supervisor_id points at them.
 *   Super Admin             - same as the old "super_admin". Bypasses
 *                            everything.
 *
 * Transition plan: every predicate below only fires once a user has a
 * resolved User role label. Anyone without one yet (user_role_id unset, the
 * "User role" list not created, or the label just not one of the 7 above)
 * falls through to whatever old role/grade logic already existed at each
 * call site — see the dual (new-first, old-fallback) checks in
 * accessControl.ts, pagePermissions.ts, taskAccessControl.ts,
 * supervisorAssignment.ts, permissionActions.ts, and appraisal/roles.ts.
 * Once every account has a User role assigned, the old role/grade paths can
 * be retired (tracked separately — not part of this change).
 */

export const USER_ROLE_LIST_LABEL = "user role";

const ROLE = {
  STANDARD: "standard",
  EXECUTIVE: "executive",
  HUMAN_RESOURCE: "human resource",
  SUPERVISORY: "supervisory",
  SYSTEM_ADMINISTRATOR: "system administrator",
  CONSULTANT: "consultant",
  SUPER_ADMIN: "super admin",
} as const;

export function normalizeUserRoleLabel(
  label: string | null | undefined,
): string | null {
  const trimmed = label?.trim().toLowerCase();
  return trimmed || null;
}

export function isStandardRoleLabel(label: string | null | undefined): boolean {
  return normalizeUserRoleLabel(label) === ROLE.STANDARD;
}

export function isExecutiveRoleLabel(label: string | null | undefined): boolean {
  return normalizeUserRoleLabel(label) === ROLE.EXECUTIVE;
}

export function isHumanResourceRoleLabel(label: string | null | undefined): boolean {
  return normalizeUserRoleLabel(label) === ROLE.HUMAN_RESOURCE;
}

export function isSupervisoryRoleLabel(label: string | null | undefined): boolean {
  return normalizeUserRoleLabel(label) === ROLE.SUPERVISORY;
}

export function isSystemAdministratorRoleLabel(
  label: string | null | undefined,
): boolean {
  return normalizeUserRoleLabel(label) === ROLE.SYSTEM_ADMINISTRATOR;
}

export function isConsultantRoleLabel(label: string | null | undefined): boolean {
  return normalizeUserRoleLabel(label) === ROLE.CONSULTANT;
}

export function isSuperAdminRoleLabel(label: string | null | undefined): boolean {
  return normalizeUserRoleLabel(label) === ROLE.SUPER_ADMIN;
}

/** Whether this string is any recognized new-system role label at all —
 * used to decide whether to trust the new system for a given user, or fall
 * back to their old role/grade (not yet migrated). */
export function isKnownUserRoleLabel(label: string | null | undefined): boolean {
  const n = normalizeUserRoleLabel(label);
  return !!n && (Object.values(ROLE) as string[]).includes(n);
}

/** Broad, org-wide elevated access (task creation, leave approval, full
 * appraisal access) — not limited to specific supervisees. Executive is the
 * old "manager" equivalent (unchanged breadth); Human Resource's breadth is
 * scoped to Human Capital + Task Manager specifically, handled separately
 * in permissionActions.ts rather than here. */
export function hasBroadElevatedAccessByRoleLabel(
  label: string | null | undefined,
): boolean {
  return (
    isSuperAdminRoleLabel(label) ||
    isExecutiveRoleLabel(label) ||
    isHumanResourceRoleLabel(label)
  );
}

/** System Definitions + User Management, unconditionally. */
export function hasSystemAccessByRoleLabel(label: string | null | undefined): boolean {
  return isSuperAdminRoleLabel(label) || isSystemAdministratorRoleLabel(label);
}

/** Who can be picked as someone's Assigned supervisor — Supervisory,
 * Executive, or Human Resource (Standard/Consultant/System Administrator
 * are not eligible). */
export function canBeAssignedAsSupervisorByRoleLabel(
  label: string | null | undefined,
): boolean {
  return (
    isSuperAdminRoleLabel(label) ||
    isSupervisoryRoleLabel(label) ||
    isExecutiveRoleLabel(label) ||
    isHumanResourceRoleLabel(label)
  );
}

/** Module keys Human Resource gets full (edit-equivalent) access to by
 * default — every Human Capital page plus Task Manager. Kept here (rather
 * than duplicated in permissionActions.ts) so the "what does HR get"
 * definition lives in one place alongside the rest of the role taxonomy. */
export const HUMAN_RESOURCE_FULL_ACCESS_KEYS = [
  "hc:leave",
  "hc:appraisal",
  "hc:justifications",
  "hc:skillLog",
  "hc:promotion",
  "hc:recruitment",
  "tm:tasks",
  "tm:calendar",
] as const;

let cachedUserRoleTableName: string | null | undefined;

/** Resolves the physical table backing the "User role" custom org-structure
 * list by label (same dynamic-lookup precedent as the org-placement options
 * route and its SQL migration) — there's no way to know the table name
 * statically since it depends on how/when the list was created. Returns
 * null if the list hasn't been created yet. Cached for the lifetime of the
 * server process; org-structure lists are essentially never renamed. */
export async function resolveUserRoleTableName(
  supabase: SupabaseClient,
): Promise<string | null> {
  if (cachedUserRoleTableName !== undefined) return cachedUserRoleTableName;

  const { data } = await supabase
    .from("org_custom_list_types")
    .select("table_name, singular, label");

  const match = (data ?? []).find((row) => {
    const name = ((row.singular as string) || (row.label as string) || "")
      .trim()
      .toLowerCase();
    return name === USER_ROLE_LIST_LABEL;
  });

  cachedUserRoleTableName = (match?.table_name as string) ?? null;
  return cachedUserRoleTableName;
}

/** Fetches {id -> label} for every row of the "User role" list. Returns an
 * empty map if the list (or its users.user_role_id column) doesn't exist
 * yet, rather than throwing — callers should treat that as "not migrated
 * yet" and fall back to old role/grade logic. */
export async function fetchUserRoleLabelMap(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const tableName = await resolveUserRoleTableName(supabase);
  if (!tableName) return map;

  const { data } = await supabase.from(tableName).select("id, label");
  for (const row of data ?? []) {
    if (row.id && row.label) map.set(row.id as string, row.label as string);
  }
  return map;
}

/** Resolves one user's effective role label from their user_role_id, or
 * null if unset/unresolvable. */
export async function resolveUserRoleLabelById(
  supabase: SupabaseClient,
  userRoleId: string | null | undefined,
): Promise<string | null> {
  if (!userRoleId) return null;
  const map = await fetchUserRoleLabelMap(supabase);
  return map.get(userRoleId) ?? null;
}
