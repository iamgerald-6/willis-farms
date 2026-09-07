import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * New role taxonomy — the ONLY source of truth for access control now. The
 * old users.role ("employee" | "manager" | "admin" | "super_admin") and
 * grade-rank thresholds are no longer consulted anywhere; anyone without a
 * resolved User role (user_role_id unset, or the list/row missing) is
 * treated as Standard Role, not as whatever their old role/grade happened
 * to be. Backed by the "User role" custom org-structure list —
 * users.user_role_id (see docs/access-control/users-org-placement-user-
 * role.sql) — a normal user-editable list rather than a fixed DB enum, so
 * role names are matched case-insensitively by label instead of a
 * hardcoded value set. Exact labels as configured in that list: "Standard
 * Role", "Executive Role", "Human Resource", "Supervisory Role", "System
 * Administrator", "Consultant", "Super Admin".
 *
 * The 7 roles and what each one means for access control:
 *   Standard Role          - baseline access, nothing elevated. Default for
 *                            anyone with no User role assigned.
 *   Executive Role          - full role access (User Management, System
 *                            Definitions, everything) — see isFullRoleAccess
 *                            in pagePermissions.ts.
 *   Consultant             - same access as Standard Role. Kept as its own
 *                            label because gradeLevelsConfig.ts already
 *                            tracks "Consultant" separately for other
 *                            things (program eligibility, salary tiers) —
 *                            nothing to do with access control.
 *   Human Resource          - full access to every Human Capital + Task
 *                            Manager page. No User Management / System
 *                            Definitions access by default.
 *   System Administrator   - System Definitions + User Management access.
 *                            Explicitly NOT granted appraise / approve leave
 *                            / fill skill log / create tasks for others —
 *                            deliberately narrower than "full role access".
 *   Supervisory Role        - who can be assigned (via users.supervisor_id,
 *                            see supervisorAssignment.ts) as someone's
 *                            reporting supervisor during onboarding.
 *                            Appraising, approving leave, filling the skill
 *                            log of, and creating tasks for a specific
 *                            employee is always done by whoever is
 *                            *actually assigned* as their supervisor_id
 *                            (set during onboarding or from Manage User) —
 *                            not by role name alone. In Manage User, the
 *                            assignable pool is wider: Executive Role,
 *                            Human Resource, or Supervisory Role.
 *   Super Admin             - bypasses everything.
 */

export const USER_ROLE_LIST_LABEL = "user role";

/** Canonical label shown to admins when nothing is picked — see
 * resolveEffectiveUserRoleLabel below. */
export const DEFAULT_USER_ROLE_LABEL = "Standard Role";

const ROLE = {
  STANDARD: "standard role",
  EXECUTIVE: "executive role",
  HUMAN_RESOURCE: "human resource",
  SUPERVISORY: "supervisory role",
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

/** The label to actually use for access-control decisions: the resolved
 * User role when there is one, else Standard Role — never the old
 * role/grade fields. Apply this at the point a user's role is loaded
 * (getApiRequestUser, resolveAccessProfile) rather than at every call site. */
export function resolveEffectiveUserRoleLabel(
  userRoleLabel: string | null | undefined,
): string {
  return userRoleLabel?.trim() || DEFAULT_USER_ROLE_LABEL;
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

/** Whether this string is any recognized new-system role label at all. */
export function isKnownUserRoleLabel(label: string | null | undefined): boolean {
  const n = normalizeUserRoleLabel(label);
  return !!n && (Object.values(ROLE) as string[]).includes(n);
}

/** Broad, org-wide elevated access for Task Manager / Leave / appraisal
 * admin (viewing all periods, archiving) — Super Admin, Executive Role, or
 * Human Resource. NOT used for deciding who personally appraises or fills
 * a skill log for a SPECIFIC employee — that's always the actual assigned
 * supervisor (supervisor_id), see canSuperviseAppraisal in appraisal/roles.ts
 * and canFillSkillLogForEmployee in skillLogAccess.ts. */
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

/** Who can be picked as someone's Assigned supervisor from Manage User —
 * Executive Role, Human Resource, or Supervisory Role (Standard, Consultant,
 * System Administrator are not eligible). Onboarding uses a narrower pool —
 * see canBeAssignedAsSupervisorAtOnboardingByRoleLabel below. */
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

/** Who can be picked as a new hire's supervisor during onboarding —
 * Supervisory Role only (narrower than the Manage User pool above, which
 * also allows Executive Role / Human Resource). */
export function canBeAssignedAsSupervisorAtOnboardingByRoleLabel(
  label: string | null | undefined,
): boolean {
  return isSuperAdminRoleLabel(label) || isSupervisoryRoleLabel(label);
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
