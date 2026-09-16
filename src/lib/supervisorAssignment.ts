import {
  canBeAssignedAsSupervisorAtOnboardingByRoleLabel,
  canBeAssignedAsSupervisorByRoleLabel,
  isSupervisoryRoleLabel,
} from "@/lib/userRoleAccessControl";
import type { User } from "@/types";

type RoleUser = Pick<User, "user_id" | "user_role_label">;
type SiteUser = Pick<User, "site_id">;

export type SupervisorAssignmentContext = "onboarding" | "manageUser";

/**
 * Whether `supervisor` may be assigned as `employee`'s reporting supervisor.
 * Purely role-based now — no grade comparison at all:
 *
 *   - "manageUser" (default, used from the Access Control profile page):
 *     Executive Role, Human Resource, Supervisory Role, or Super Admin.
 *   - "onboarding" (Offer terms / invite): Supervisory Role, Executive Role,
 *     or Human Resource — people who may be a new hire's line manager,
 *     whether or not anyone currently reports to them.
 *
 * Anyone without a resolved User role (or with Standard Role/Consultant/
 * System Administrator) is never eligible — there is no old-system
 * grade-rank fallback anymore.
 */
export function canAssignAsSupervisor(
  supervisor: RoleUser,
  employee: RoleUser,
  context: SupervisorAssignmentContext = "manageUser",
): boolean {
  if (supervisor.user_id === employee.user_id) return false;
  return context === "onboarding"
    ? canBeAssignedAsSupervisorAtOnboardingByRoleLabel(supervisor.user_role_label)
    : canBeAssignedAsSupervisorByRoleLabel(supervisor.user_role_label);
}

/**
 * Site rule layered on top of the role eligibility above:
 *   - Supervisory Role candidates must be at the employee's own site,
 *     exactly — no headquarters exception. A Supervisory Role person at a
 *     different site (headquarters included) never shows.
 *   - Executive Role / Human Resource / Super Admin candidates may be at
 *     the employee's own site OR at headquarters — someone in that group
 *     who is neither doesn't show either.
 * A candidate or employee with no site_id of their own can never satisfy
 * "same site" (a missing site isn't "safe to assume matches" — same
 * "not proven to be theirs" rule used everywhere else site access is
 * decided; see assertSiteAccess in src/lib/siteAccess.ts).
 */
function isSupervisorSiteEligible(
  supervisor: RoleUser & SiteUser,
  employee: SiteUser,
  headquartersSiteIds: ReadonlySet<string>,
): boolean {
  const supervisorSiteId = supervisor.site_id != null ? String(supervisor.site_id) : null;
  const employeeSiteId = employee.site_id != null ? String(employee.site_id) : null;
  const sameSite = supervisorSiteId != null && supervisorSiteId === employeeSiteId;

  if (isSupervisoryRoleLabel(supervisor.user_role_label)) return sameSite;
  return sameSite || (supervisorSiteId != null && headquartersSiteIds.has(supervisorSiteId));
}

export function eligibleSupervisorsForEmployee(
  employee: RoleUser & SiteUser,
  users: User[],
  context: SupervisorAssignmentContext = "manageUser",
  // Site ids marked is_headquarters — see SiteTagPicker.tsx for the same
  // "sites" custom-list lookup this is meant to be built from. Defaults to
  // empty, which collapses the headquarters exception above to "same site
  // only" for everyone — callers that haven't been updated to pass this
  // yet get the stricter behavior rather than an accidental bypass.
  headquartersSiteIds: ReadonlySet<string> = new Set(),
): User[] {
  return users
    .filter(
      (u) =>
        u.user_id !== employee.user_id &&
        canAssignAsSupervisor(u, employee, context) &&
        isSupervisorSiteEligible(u, employee, headquartersSiteIds),
    )
    .sort((a, b) => {
      const nameA = `${a.first_name} ${a.last_name}`.trim();
      const nameB = `${b.first_name} ${b.last_name}`.trim();
      return nameA.localeCompare(nameB);
    });
}

type NameMatchUser = Pick<User, "user_id" | "first_name" | "last_name">;

export function resolveSupervisorByName(
  name: string | null | undefined,
  users: NameMatchUser[],
): NameMatchUser | null {
  const target = name?.trim().toLowerCase();
  if (!target) return null;

  return (
    users.find((u) => {
      const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`
        .trim()
        .toLowerCase();
      return full === target;
    }) ?? null
  );
}

export function supervisorDisplayName(
  users: User[],
  supervisorId: string | null | undefined,
): string | null {
  if (!supervisorId) return null;
  const sup = users.find((u) => u.user_id === supervisorId);
  if (!sup) return null;
  return `${sup.first_name} ${sup.last_name}`.trim() || sup.email;
}

/** Whether `supervisorUserId` is the employee's assigned reporting supervisor. */
export function isAssignedSupervisorOf(
  supervisorUserId: string | null | undefined,
  employee: Pick<User, "supervisor_id">,
): boolean {
  return (
    !!supervisorUserId &&
    !!employee.supervisor_id &&
    employee.supervisor_id === supervisorUserId
  );
}
