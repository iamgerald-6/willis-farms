import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiRequestUser } from "@/lib/apiRequestAuth";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import { canAppraiseOthers } from "@/lib/appraisal/sections";
import { isAssignedSupervisorOf } from "@/lib/supervisorAssignment";
import { canPerformModuleAction } from "@/lib/permissionActions";
import {
  resolveAccessProfile,
  type AccessProfile,
} from "@/lib/pagePermissions";
import type { GroupPresetsMap } from "@/lib/groupPermissionPresets";

export type AppraisalListScope = "all" | "reports" | "own";

/** Pick the viewer's own appraisal row — never fall back to rows[0]. */
export function findOwnAppraisalRow<
  T extends { employee_user_id?: string | null; company_id?: string | null },
>(rows: T[], userId?: string | null, companyId?: string | null): T | null {
  if (!rows.length) return null;
  if (userId) {
    const byUser = rows.find((row) => row.employee_user_id === userId);
    if (byUser) return byUser;
  }
  if (companyId) {
    const byCompany = rows.find((row) => row.company_id === companyId);
    if (byCompany) return byCompany;
  }
  return null;
}

/** Client-side: role label or permission matrix may grant team appraisal access. */
export function canActOnTeamAppraisalsFromProfile(
  profile: AccessProfile | null | undefined,
  role?: string | null,
): boolean {
  const effectiveRole = profile?.role ?? role;
  if (canAppraiseOthers(effectiveRole)) return true;
  if (!profile) return false;
  return (
    canPerformModuleAction(profile, "hc:appraisal", "edit", effectiveRole) ||
    canPerformModuleAction(profile, "hc:appraisal", "review", effectiveRole)
  );
}

function profileFromApiUser(user: ApiRequestUser): AccessProfile {
  return resolveAccessProfile(
    {
      role: user.role,
      user_role_label: user.role,
      grade_level: user.grade_level,
      access_tier: user.access_tier,
      page_permissions: user.page_permissions,
      page_permission_levels: user.page_permission_levels,
      page_permission_actions: user.page_permission_actions,
    },
    user.role,
  )!;
}

/** May open/fill team appraisals — role or permission matrix. */
export function canActOnTeamAppraisals(
  user: ApiRequestUser,
  presets?: GroupPresetsMap | null,
): boolean {
  if (canAppraiseOthers(user.role)) return true;
  const profile = profileFromApiUser(user);
  return (
    canPerformModuleAction(profile, "hc:appraisal", "edit", user.role, presets) ||
    canPerformModuleAction(profile, "hc:appraisal", "review", user.role, presets)
  );
}

export function resolveAppraisalListScope(
  user: ApiRequestUser,
  presets?: GroupPresetsMap | null,
): AppraisalListScope {
  if (hasFullAppraisalAccess(user.role)) return "all";
  if (canActOnTeamAppraisals(user, presets)) return "reports";
  return "own";
}

/** Whether the caller may open this appraisal record. */
export function canAccessAppraisalRecord(
  user: ApiRequestUser,
  record: {
    company_id?: string | null;
    employee_user_id?: string | null;
    supervisor_id?: string | null;
  },
  employeeSupervisorId?: string | null,
  presets?: GroupPresetsMap | null,
): boolean {
  if (hasFullAppraisalAccess(user.role)) return true;

  if (user.id && record.employee_user_id === user.id) return true;

  if (
    user.company_id &&
    record.company_id === user.company_id &&
    !record.employee_user_id
  ) {
    return true;
  }

  if (canActOnTeamAppraisals(user, presets) && user.id) {
    const assignedSupervisorId = employeeSupervisorId ?? record.supervisor_id;
    return assignedSupervisorId === user.id;
  }

  return false;
}

function teamAppraisalAccessFromViewer(viewer: {
  role?: string | null;
  accessTier?: string | null;
  pagePermissionLevels?: AccessProfile["page_permission_levels"];
  pagePermissionActions?: AccessProfile["page_permission_actions"];
}): boolean {
  return canActOnTeamAppraisalsFromProfile(
    resolveAccessProfile(
      {
        role: viewer.role,
        user_role_label: viewer.role,
        access_tier: viewer.accessTier,
        page_permission_levels: viewer.pagePermissionLevels,
        page_permission_actions: viewer.pagePermissionActions,
      },
      viewer.role,
    ),
    viewer.role,
  );
}

/** Whether the viewer may complete the supervisor side for this employee. */
export function canSuperviseAppraisalRecord(
  viewer: {
    userId?: string | null;
    role?: string | null;
    accessTier?: string | null;
    pagePermissionLevels?: AccessProfile["page_permission_levels"];
    pagePermissionActions?: AccessProfile["page_permission_actions"];
  },
  subject: {
    employee_user_id?: string | null;
    company_id?: string | null;
    supervisor_id?: string | null;
  },
  employee?: { supervisor_id?: string | null } | null,
  user?: ApiRequestUser | null,
  presets?: GroupPresetsMap | null,
): boolean {
  if (
    viewer.userId &&
    subject.employee_user_id &&
    viewer.userId === subject.employee_user_id
  ) {
    return false;
  }

  if (hasFullAppraisalAccess(viewer.role)) return true;

  const canAct = user
    ? canActOnTeamAppraisals(user, presets)
    : teamAppraisalAccessFromViewer(viewer);

  if (!viewer.userId || !canAct) return false;

  const assignedSupervisorId =
    employee?.supervisor_id ?? subject.supervisor_id ?? null;

  return isAssignedSupervisorOf(viewer.userId, {
    supervisor_id: assignedSupervisorId,
  });
}

export type DirectReport = {
  user_id: string;
  company_id: string | null;
};

/** Employees whose users.supervisor_id points at this supervisor. */
export async function loadDirectReports(
  supabaseAdmin: SupabaseClient,
  supervisorUserId: string,
): Promise<DirectReport[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id, company_id")
    .eq("supervisor_id", supervisorUserId);

  if (error) throw new Error(error.message);
  return (data ?? []) as DirectReport[];
}

/** Staff ids (users.company_id) for the supervisor and their direct reports. */
export function staffIdsForSupervisorScope(
  caller: ApiRequestUser,
  reports: DirectReport[],
): string[] {
  return [
    ...new Set(
      [caller.company_id, ...reports.map((report) => report.company_id)].filter(
        (id): id is string => !!id,
      ),
    ),
  ];
}

/** Appraisal rows are keyed by each employee's unique company_id (staff id). */
export function appraisalRowVisibleToSupervisor(
  row: {
    company_id?: string | null;
    employee_user_id?: string | null;
    supervisor_id?: string | null;
  },
  caller: ApiRequestUser,
  reports: DirectReport[],
): boolean {
  const reportUserIds = new Set(reports.map((r) => r.user_id));
  const reportCompanyIds = new Set(
    reports.map((r) => r.company_id).filter((id): id is string => !!id),
  );

  if (row.employee_user_id && row.employee_user_id === caller.id) return true;
  if (caller.company_id && row.company_id === caller.company_id) return true;
  if (row.employee_user_id && reportUserIds.has(row.employee_user_id)) {
    return true;
  }
  if (row.company_id && reportCompanyIds.has(row.company_id)) return true;
  if (row.supervisor_id === caller.id) return true;
  return false;
}

export async function fetchEmployeeSupervisorId(
  supabaseAdmin: SupabaseClient,
  employeeUserId: string | null | undefined,
): Promise<string | null> {
  if (!employeeUserId) return null;
  const { data } = await supabaseAdmin
    .from("users")
    .select("supervisor_id")
    .eq("user_id", employeeUserId)
    .maybeSingle();
  return data?.supervisor_id ?? null;
}
