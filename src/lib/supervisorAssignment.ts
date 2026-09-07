import {
  canBeAssignedAsSupervisorAtOnboardingByRoleLabel,
  canBeAssignedAsSupervisorByRoleLabel,
} from "@/lib/userRoleAccessControl";
import type { User } from "@/types";

type RoleUser = Pick<User, "user_id" | "user_role_label">;

export type SupervisorAssignmentContext = "onboarding" | "manageUser";

/**
 * Whether `supervisor` may be assigned as `employee`'s reporting supervisor.
 * Purely role-based now — no grade comparison at all:
 *
 *   - "manageUser" (default, used from the Access Control profile page):
 *     Executive Role, Human Resource, Supervisory Role, or Super Admin.
 *   - "onboarding" (used when inviting a new hire): Supervisory Role or
 *     Super Admin only — narrower, since this is picking a new hire's direct
 *     line supervisor specifically.
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

export function eligibleSupervisorsForEmployee(
  employee: RoleUser,
  users: User[],
  context: SupervisorAssignmentContext = "manageUser",
): User[] {
  return users
    .filter(
      (u) =>
        u.user_id !== employee.user_id &&
        canAssignAsSupervisor(u, employee, context),
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
