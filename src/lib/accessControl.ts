/**
 * Centralised access-control helpers for the HR module.
 *
 * Grade thresholds use rank from System Definitions (mod:recruitment → gradeLevelsConfig).
 * L4+ (rank ≥ 4) = supervisor. L5+ (rank ≥ 5) = full appraisal access for employees.
 */

import {
  canRateGradeLevel,
  canSignOffSkillLogGrade,
  gradeIndexInOrder,
  gradesBelowViewer,
  isFullAppraisalRank,
  isSupervisorRank,
  MIN_FULL_APPRAISAL_RANK,
  MIN_SUPERVISOR_RANK,
  resolveGradeOrder,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";

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

/** L4+ is a supervisor. Grade alone determines this — role is irrelevant. */
export function isSupervisor(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  return isSupervisorRank(grade, config);
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "super_admin";
}

export function canViewOthers(
  role: string | null | undefined,
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  if (isSuperAdmin(role)) return true;
  if (role === "admin" || role === "manager") return true;
  return isSupervisor(grade, config);
}

export function canActOnOthers(
  role: string | null | undefined,
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  if (isSuperAdmin(role)) return true;
  return isSupervisor(grade, config);
}

export function canRateGrade(
  viewerGrade: string | null | undefined,
  targetGrade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  return canRateGradeLevel(viewerGrade, targetGrade, config);
}

/** Grades the viewer may appraise/fill for (strictly below their rank, L4+ only). */
export function gradeBandsBelow(
  viewerGrade: string | null | undefined,
  config?: GradeLevelsConfig,
): Grade[] {
  return gradesBelowViewer(viewerGrade, config);
}

export function hasFullAppraisalAccess(
  role: string | null | undefined,
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  if (role === "manager" || role === "admin" || role === "super_admin") {
    return true;
  }
  return isFullAppraisalRank(grade, config);
}

export function canViewAllAppraisalPeriods(
  role: string | null | undefined,
): boolean {
  return role === "manager" || role === "admin" || role === "super_admin";
}

export function canArchiveAppraisal(
  role: string | null | undefined,
  pagePermissionLevels?: Partial<Record<string, "view" | "add" | "edit">> | null,
): boolean {
  if (role === "super_admin" || role === "manager") return true;
  if (role === "admin") {
    return pagePermissionLevels?.["hc:appraisal"] === "edit";
  }
  return false;
}

export const canReviewJustification = hasFullAppraisalAccess;

export function canSignOffSkillLog(
  viewerGrade: string | null | undefined,
  fillerGrade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  return canSignOffSkillLogGrade(viewerGrade, fillerGrade, config);
}

export { MIN_SUPERVISOR_RANK, MIN_FULL_APPRAISAL_RANK };
