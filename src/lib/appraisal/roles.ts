import { canBeAssignedAsSupervisorByRoleLabel } from "@/lib/userRoleAccessControl";

/**
 * Which side of an appraisal a given person occupies.
 *
 * Everyone completes their own self-assessment. The supervisor side is
 * available to anyone whose user_role_id is Supervisory Role, Executive
 * Role, Human Resource, or Super Admin — not users.supervisor_id.
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

/** Supervisor side: user_role_id is Supervisory / Executive / Human Resource
 * / Super Admin, and this is not their own record. */
export function canSuperviseAppraisal(
  viewer: AppraisalViewer,
  subject: AppraisalSubject,
): boolean {
  if (isOwnAppraisal(viewer, subject)) return false;
  return canBeAssignedAsSupervisorByRoleLabel(viewer.role);
}

export function appraisalSideFor(
  viewer: AppraisalViewer,
  subject: AppraisalSubject,
): AppraisalSide {
  if (isOwnAppraisal(viewer, subject)) return "employee";
  if (canSuperviseAppraisal(viewer, subject)) return "supervisor";
  return "observer";
}
