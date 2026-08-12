import { canRate } from "./sections";

/**
 * Which side of an appraisal a given person occupies.
 *
 * The side is a property of the RECORD, not of the viewer's grade: everyone,
 * supervisors included, completes their own self-assessment, and the
 * supervisor side is always filled by someone strictly senior (L3 minimum).
 */
export type AppraisalSide = "employee" | "supervisor" | "observer";

export interface AppraisalViewer {
  userId?: string | null;
  role?: string | null;
  gradeLevel?: string | null;
  companyId?: string | null;
}

export interface AppraisalSubject {
  employee_user_id?: string | null;
  company_id?: string | null;
  /** The appraised person's grade, e.g. "L5". */
  current_grade?: string | null;
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

/**
 * Super Admin is the only role-based exception — the highest grade (L7) has
 * nobody above them, so without it their supervisor side could never be filled.
 */
export function canSuperviseAppraisal(
  viewer: AppraisalViewer,
  subject: AppraisalSubject,
): boolean {
  if (isOwnAppraisal(viewer, subject)) return false;
  if (viewer.role === "super_admin") return true;
  return canRate(viewer.gradeLevel, subject.current_grade);
}

export function appraisalSideFor(
  viewer: AppraisalViewer,
  subject: AppraisalSubject,
): AppraisalSide {
  if (isOwnAppraisal(viewer, subject)) return "employee";
  if (canSuperviseAppraisal(viewer, subject)) return "supervisor";
  return "observer";
}
