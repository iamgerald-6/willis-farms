import type { ApiRequestUser } from "@/lib/apiRequestAuth";
import { canSuperviseAppraisalRecord } from "@/lib/appraisalAccess";
import type { GroupPresetsMap } from "@/lib/groupPermissionPresets";

/**
 * Which side of an appraisal a given person occupies.
 *
 * Everyone completes their own self-assessment. Executive / HR / Super Admin
 * may complete the supervisor side for anyone; Supervisory Role only for
 * employees assigned via users.supervisor_id.
 */
export type AppraisalSide = "employee" | "supervisor" | "observer";

export interface AppraisalViewer {
  userId?: string | null;
  role?: string | null;
  gradeLevel?: string | null;
  companyId?: string | null;
  accessTier?: string | null;
  pagePermissionLevels?: Partial<
    Record<string, "view" | "add" | "edit">
  > | null;
  pagePermissionActions?: Partial<
    Record<string, Partial<Record<string, boolean>>>
  > | null;
}

export interface AppraisalSubject {
  employee_user_id?: string | null;
  company_id?: string | null;
  /** The appraised person's grade, e.g. "L5". */
  current_grade?: string | null;
  supervisor_id?: string | null;
}

/** Rows seeded before employee_user_id existed fall back to company_id. */
export function isOwnAppraisal(
  viewer: AppraisalViewer,
  subject: AppraisalSubject,
): boolean {
  if (viewer.userId && subject.employee_user_id) {
    return viewer.userId === subject.employee_user_id;
  }
  if (viewer.companyId && subject.company_id) {
    return viewer.companyId === subject.company_id;
  }
  return false;
}

/** Supervisor side: Executive / HR / Super Admin may act on any record;
 * Supervisory Role only on employees assigned via users.supervisor_id. */
export function canSuperviseAppraisal(
  viewer: AppraisalViewer,
  subject: AppraisalSubject,
  employee?: { supervisor_id?: string | null } | null,
  apiUser?: ApiRequestUser | null,
  presets?: GroupPresetsMap | null,
): boolean {
  return canSuperviseAppraisalRecord(
    viewer,
    subject,
    employee,
    apiUser,
    presets,
  );
}

export function appraisalSideFor(
  viewer: AppraisalViewer,
  subject: AppraisalSubject,
): AppraisalSide {
  if (isOwnAppraisal(viewer, subject)) return "employee";
  if (canSuperviseAppraisal(viewer, subject)) return "supervisor";
  return "observer";
}
