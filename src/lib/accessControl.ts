/**
 * Centralised access-control helpers for the HR module.
 *
 * Grade rank is no longer used for access decisions here — see
 * userRoleAccessControl.ts.
 *
 * Two different facts:
 *   - user_role_id (the role label): may this person use supervisor
 *     features at all? Supervisory Role, Executive Role, Human Resource,
 *     or Super Admin. Standard, Consultant, and System Administrator cannot.
 *   - users.supervisor_id: who reports to them. Used only when deciding
 *     WHICH people's records they can fill/review — see
 *     isAssignedSupervisorOf in supervisorAssignment.ts. It is not the
 *     ticket in to the supervisor tab.
 */

import {
  canBeAssignedAsSupervisorByRoleLabel,
  hasBroadElevatedAccessByRoleLabel,
  isSuperAdminRoleLabel,
} from "@/lib/userRoleAccessControl";

export type Grade = string;
export type UserRole = "employee" | "admin" | "manager" | "super_admin";

/** Role-only: may this person act as a supervisor (open the tab / fill). */
export function isSupervisor(role: string | null | undefined): boolean {
  return canBeAssignedAsSupervisorByRoleLabel(role);
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "super_admin" || isSuperAdminRoleLabel(role);
}

/** May see other people's records (Leave All Requests, promotion list, …). */
export function canViewOthers(role: string | null | undefined): boolean {
  if (isSuperAdmin(role)) return true;
  if (hasBroadElevatedAccessByRoleLabel(role)) return true;
  return isSupervisor(role);
}

/** May create/fill records for other people. Role only — the employee
 * picker still filters to assigned reports via users.supervisor_id. */
export function canActOnOthers(role: string | null | undefined): boolean {
  return isSupervisor(role);
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

/** May configure skill log templates (Manage skill logs tab) — Super Admin,
 * Executive, or Human Resource. Mirrors hasFullAppraisalAccess; not the same
 * as canFillSkillLog/canApproveSkillLogRecord, which govern filling out and
 * signing off an individual employee's log. */
export function hasFullSkillLogAccess(
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
