import { isSuperAdmin } from "@/lib/accessControl";
import {
  canRateGradeLevel,
  isSupervisorRank,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";
import type { User } from "@/types";

type GradeUser = Pick<User, "user_id" | "grade_level" | "role">;

/** Whether `supervisor` may be assigned to appraise `employee` (L4+ and strictly senior). */
export function canAssignAsSupervisor(
  supervisor: GradeUser,
  employee: GradeUser,
  config?: GradeLevelsConfig,
): boolean {
  if (supervisor.user_id === employee.user_id) return false;
  if (isSuperAdmin(supervisor.role)) return true;
  if (!isSupervisorRank(supervisor.grade_level, config)) return false;
  return canRateGradeLevel(
    supervisor.grade_level,
    employee.grade_level,
    config,
  );
}

export function eligibleSupervisorsForEmployee(
  employee: GradeUser,
  users: User[],
  config?: GradeLevelsConfig,
): User[] {
  return users
    .filter(
      (u) =>
        u.user_id !== employee.user_id &&
        canAssignAsSupervisor(u, employee, config),
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
