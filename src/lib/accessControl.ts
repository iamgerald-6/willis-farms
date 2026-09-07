/**
 * Centralised access-control helpers for the HR module.
 *
 * Grade rank is no longer used for access decisions here — see
 * userRoleAccessControl.ts. "Supervisor" standing now comes from the new
 * role system (Supervisory Role, or broader Super Admin/Executive
 * Role/Human Resource) COMBINED with actually having at least one person
 * assigned to you (users.supervisor_id) — same rule already applied to
 * skill-log sign-off (see hasAssignedSupervisees in skillLogAccess.ts).
 * Holding the role alone, with nobody assigned, does not count: these are
 * broad "does this person supervise anyone at all" checks, not
 * per-employee ones — per-employee actions always go through
 * isAssignedSupervisorOf (see supervisorAssignment.ts) instead.
 */

import { resolveGradeOrder, gradeIndexInOrder } from "@/lib/systemDefinitions/gradeLevelsConfig";
import type { GradeLevelsConfig } from "@/lib/systemDefinitions/gradeLevelsConfig";
import {
  hasBroadElevatedAccessByRoleLabel,
  isSuperAdminRoleLabel,
  isSupervisoryRoleLabel,
} from "@/lib/userRoleAccessControl";

/** @deprecated Use resolveGradeOrder(config) — kept for registry compatibility. */
export const GRADE_ORDER = resolveGradeOrder();

export type Grade = string;
export type UserRole = "employee" | "admin" | "manager" | "super_admin";

/** Returns 0-based index in configured grade order, or -1 for unknown. */
export function gradeIndex(
  g: string | null | undefined,
  config?: GradeLevelsConfig,
): number {
  return gradeIndexInOrder(g, config);
}

/** Supervisory standing: Super Admin unconditionally, or Supervisory Role
 * AND at least one person actually assigned to them. `hasSupervisees` is
 * computed by the caller from the loaded user list (or a DB query
 * server-side) — see the module docstring above. */
export function isSupervisor(
  role: string | null | undefined,
  hasSupervisees: boolean,
): boolean {
  return isSuperAdminRoleLabel(role) || (isSupervisoryRoleLabel(role) && hasSupervisees);
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "super_admin" || isSuperAdminRoleLabel(role);
}

export function canViewOthers(
  role: string | null | undefined,
  hasSupervisees: boolean,
): boolean {
  if (isSuperAdmin(role)) return true;
  if (hasBroadElevatedAccessByRoleLabel(role)) return true;
  return isSupervisor(role, hasSupervisees);
}

export function canActOnOthers(
  role: string | null | undefined,
  hasSupervisees: boolean,
): boolean {
  if (isSuperAdmin(role)) return true;
  return isSupervisor(role, hasSupervisees);
}

export function hasFullAppraisalAccess(
  role: string | null | undefined,
): boolean {
  return hasBroadElevatedAccessByRoleLabel(role);
}

export function canViewAllAppraisalPeriods(
  role: string | null | undefined,
): boolean {
  return hasBroadElevatedAccessByRoleLabel(role);
}

export function canArchiveAppraisal(
  role: string | null | undefined,
  pagePermissionLevels?: Partial<Record<string, "view" | "add" | "edit">> | null,
): boolean {
  if (hasBroadElevatedAccessByRoleLabel(role)) return true;
  return pagePermissionLevels?.["hc:appraisal"] === "edit";
}

export const canReviewJustification = hasFullAppraisalAccess;
