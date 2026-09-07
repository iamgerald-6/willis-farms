import { isSuperAdminRoleLabel } from "@/lib/userRoleAccessControl";

/**
 * Which side of an appraisal a given person occupies.
 *
 * The side is a property of the RECORD, not of the viewer's role: everyone,
 * supervisors included, completes their own self-assessment, and the
 * supervisor side is always filled by whoever is actually assigned as that
 * employee's supervisor (users.supervisor_id, set at onboarding or from
 * Manage User) — see canSuperviseAppraisal below.
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
  /** The appraised person's assigned reporting supervisor — see
   * supervisorAssignment.ts. Used for the new Supervisory-role check below. */
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

/**
 * Super Admin bypasses everything. Everyone else — regardless of role —
 * supervises an appraisal only if they're the employee's actual assigned
 * supervisor (users.supervisor_id, set during onboarding or from Manage
 * User). Being eligible to BE assigned as a supervisor (Executive Role,
 * Human Resource, Supervisory Role — see canBeAssignedAsSupervisorByRoleLabel
 * in supervisorAssignment.ts) is a separate, earlier check; it doesn't by
 * itself grant appraisal access to anyone who wasn't actually assigned.
 */
export function canSuperviseAppraisal(
  viewer: AppraisalViewer,
  subject: AppraisalSubject,
): boolean {
  if (isOwnAppraisal(viewer, subject)) return false;
  if (isSuperAdminRoleLabel(viewer.role)) return true;
  return !!viewer.userId && subject.supervisor_id === viewer.userId;
}

export function appraisalSideFor(
  viewer: AppraisalViewer,
  subject: AppraisalSubject,
): AppraisalSide {
  if (isOwnAppraisal(viewer, subject)) return "employee";
  if (canSuperviseAppraisal(viewer, subject)) return "supervisor";
  return "observer";
}
