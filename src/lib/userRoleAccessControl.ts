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
 *   Standard Role          - overview; own leave/appraisal/skill log; SOP/
 *                            policies view; task manager (self tasks). Default
 *                            when no User role is assigned.
 *   Executive Role          - full role access (User Management, System
 *                            Definitions, everything) — see isFullRoleAccess
 *                            in pagePermissions.ts.
 *   Consultant             - same access as Standard Role. Kept as its own
 *                            label because gradeLevelsConfig.ts already
 *                            tracks "Consultant" separately for other
 *                            things (program eligibility, salary tiers) —
 *                            nothing to do with access control.
 *   Human Resource          - access to all modules except System
 *                            Definitions. Cannot sign off skill logs.
 *   System Administrator   - System Definitions + User Management access.
 *                            Explicitly NOT granted appraise / approve leave
 *                            / fill skill log / create tasks for others —
 *                            deliberately narrower than "full role access".
 *   Supervisory Role        - Standard access plus appraise/fill skill logs
 *                            and approve leave for assigned reports only;
 *                            create tasks for self and supervisees. Scope is
 *                            always users.supervisor_id assignment.
 *   Super Admin             - bypasses everything.
 *   Built-in matrices live in groupPermissionPresets.ts
 *   (getBuiltInRolePermissionActions).
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

/** The 7 roles in the order they're documented above — for anywhere the UI
 * needs to list/iterate them consistently (e.g. the Access Control group
 * picker). Display label exactly as configured in the "User role" list. */
export const USER_ROLE_LABELS = [
  "Standard Role",
  "Executive Role",
  "Human Resource",
  "Supervisory Role",
  "System Administrator",
  "Consultant",
  "Super Admin",
] as const;

/** Stable, URL/DB-safe key per role — used as the `group_key` for a role's
 * shared permission preset (access_group_presets) and as the value for the
 * Access Control group-filter dropdown. Replaces the old role-literal +
 * grade-band keys ("employees"/"managers"/"admins"/"grade_l1_l3"/
 * "grade_l4_l7") now that access control is driven entirely by the new role
 * system — see the module docstring above. */
export type UserRoleGroupKey =
  | "standard_role"
  | "executive_role"
  | "human_resource"
  | "supervisory_role"
  | "system_administrator"
  | "consultant"
  | "super_admin";

export const USER_ROLE_GROUP_KEYS: UserRoleGroupKey[] = [
  "standard_role",
  "executive_role",
  "human_resource",
  "supervisory_role",
  "system_administrator",
  "consultant",
  "super_admin",
];

const ROLE_LABEL_BY_GROUP_KEY: Record<UserRoleGroupKey, string> = {
  standard_role: "Standard Role",
  executive_role: "Executive Role",
  human_resource: "Human Resource",
  supervisory_role: "Supervisory Role",
  system_administrator: "System Administrator",
  consultant: "Consultant",
  super_admin: "Super Admin",
};

export function userRoleGroupKeyLabel(key: UserRoleGroupKey): string {
  return ROLE_LABEL_BY_GROUP_KEY[key];
}

/** Resolves any role label (in whatever case) to its stable group key, or
 * null if it isn't one of the 7 recognized roles. */
export function userRoleGroupKeyFromLabel(
  label: string | null | undefined,
): UserRoleGroupKey | null {
  const n = normalizeUserRoleLabel(label);
  switch (n) {
    case ROLE.STANDARD:
      return "standard_role";
    case ROLE.EXECUTIVE:
      return "executive_role";
    case ROLE.HUMAN_RESOURCE:
      return "human_resource";
    case ROLE.SUPERVISORY:
      return "supervisory_role";
    case ROLE.SYSTEM_ADMINISTRATOR:
      return "system_administrator";
    case ROLE.CONSULTANT:
      return "consultant";
    case ROLE.SUPER_ADMIN:
      return "super_admin";
    default:
      return null;
  }
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
 * Executive Role, Human Resource, Supervisory Role, or Super Admin
 * (Standard, Consultant, System Administrator are not eligible). Offer /
 * onboarding uses the same three line-manager roles without Super Admin —
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

/** Who can be picked as a new hire's line manager on Offer terms /
 * onboarding: Supervisory Role, Executive Role, or Human Resource.
 * Super Admin is not in this list — they can still be assigned later from
 * Manage User. Does not depend on whether anyone currently reports to them. */
export function canBeAssignedAsSupervisorAtOnboardingByRoleLabel(
  label: string | null | undefined,
): boolean {
  return (
    isSupervisoryRoleLabel(label) ||
    isExecutiveRoleLabel(label) ||
    isHumanResourceRoleLabel(label)
  );
}

/** @deprecated Use humanResourceRolePermissionActions() in
 * groupPermissionPresets.ts — HR gets all page keys except sys:definitions. */
export const HUMAN_RESOURCE_FULL_ACCESS_KEYS = [
  "dashboard",
  "users",
  "hc:leave",
  "hc:appraisal",
  "hc:justifications",
  "hc:skillLog",
  "hc:promotion",
  "hc:recruitment",
  "tm:tasks",
  "tm:calendar",
  "policies",
  "sop:view",
  "sop:add",
  "notifications",
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
