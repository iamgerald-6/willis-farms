import { isConsultantGrade } from "@/lib/systemDefinitions/gradeLevelsConfig";
import { fetchGroupPresetsFromDb, type GroupPresetsMap } from "@/lib/groupPermissionPresets";
import { canPerformModuleAction } from "@/lib/permissionActions";
import type { AccessProfile } from "@/lib/pagePermissions";
import { isAssignedSupervisorOf } from "@/lib/supervisorAssignment";
import {
  canBeAssignedAsSupervisorByRoleLabel,
  isExecutiveRoleLabel,
  isSuperAdminRoleLabel,
} from "@/lib/userRoleAccessControl";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SkillLogRecord = {
  id: string;
  employee_id?: string;
  supervisor_id?: string;
  status: string;
  employee?: { user_id?: string; grade_level?: string | null } | null;
  supervisor?: { user_id?: string; grade_level?: string | null } | null;
};

type EmbeddedGradeUser = {
  grade_levels?: { code: string | null } | null;
  grade_level_id?: string | null;
  [key: string]: unknown;
};

/**
 * grade_level is no longer a stored column on users — every skill_logs
 * query embeds the employee/supervisor via grade_level_id's FK join to
 * grade_levels(code) instead. Flatten that embed back onto a top-level
 * `grade_level` field so client code (SkillLogDetailModal, SkillLogforms,
 * skillLogForms/page.tsx, skillLog/page.tsx, …) reads the same shape it
 * always has, without ever touching a stored/driftable grade_level column.
 */
export function flattenSkillLogGradeLevels<
  T extends { employee?: EmbeddedGradeUser | null; supervisor?: EmbeddedGradeUser | null },
>(row: T): T {
  const flattenUser = (u?: EmbeddedGradeUser | null) => {
    if (!u) return u;
    const { grade_levels, ...rest } = u;
    return { ...rest, grade_level: grade_levels?.code ?? null };
  };
  return {
    ...row,
    employee: flattenUser(row.employee) as T["employee"],
    supervisor: flattenUser(row.supervisor) as T["supervisor"],
  };
}

function employeeId(log: SkillLogRecord): string | undefined {
  return log.employee?.user_id ?? log.employee_id;
}

function supervisorId(log: SkillLogRecord): string | undefined {
  return log.supervisor?.user_id ?? log.supervisor_id;
}


export function canViewSkillLogRecord(
  profile: AccessProfile | null | undefined,
  userId: string,
  log: SkillLogRecord,
  groupPresets?: GroupPresetsMap | null,
  sessionRole?: string | null,
  _hasSupervisees = false,
): boolean {
  if (!profile || !userId) return false;
  if (!canPerformModuleAction(profile, "hc:skillLog", "view", sessionRole, groupPresets)) {
    return false;
  }

  const empId = employeeId(log);
  const supId = supervisorId(log);

  // Filler always sees their own drafts, submissions, and signed-off logs.
  if (supId === userId) return true;

  // The employee (supervisee) only sees the log after Executive sign-off —
  // not while it is still a draft or sitting in the submitted queue.
  if (empId === userId) return log.status === "signed_off";

  if (
    (log.status === "submitted" || log.status === "signed_off") &&
    canPerformModuleAction(profile, "hc:skillLog", "review", sessionRole, groupPresets)
  ) {
    return true;
  }

  if (
    supId !== userId &&
    canPerformModuleAction(profile, "hc:skillLog", "approve", sessionRole, groupPresets)
  ) {
    if (log.status === "signed_off") return true;
    if (log.status === "submitted" && canSignOffSkillLogEffective(profile)) {
      return true;
    }
  }

  return false;
}

/** Sign-off is Executive Role (or Super Admin). The person who filled the
 * log cannot also sign it off — even if they are an Executive. */
function canSignOffSkillLogEffective(profile: AccessProfile): boolean {
  return isSuperAdminRoleLabel(profile.role) || isExecutiveRoleLabel(profile.role);
}

export function canApproveSkillLogRecord(
  profile: AccessProfile | null | undefined,
  userId: string,
  log: SkillLogRecord,
  groupPresets?: GroupPresetsMap | null,
  sessionRole?: string | null,
  _hasSupervisees = false,
): boolean {
  if (!profile || !userId) return false;
  if (log.status !== "submitted") return false;

  const supId = supervisorId(log);
  if (!supId || supId === userId) return false;

  if (!canPerformModuleAction(profile, "hc:skillLog", "approve", sessionRole, groupPresets)) {
    return false;
  }

  return canSignOffSkillLogEffective(profile);
}

export function canEditSkillLogDraft(
  profile: AccessProfile | null | undefined,
  userId: string,
  log: SkillLogRecord,
  groupPresets?: GroupPresetsMap | null,
  sessionRole?: string | null,
): boolean {
  if (!profile || !userId || log.status !== "draft") return false;
  if (supervisorId(log) !== userId) return false;
  return canPerformModuleAction(profile, "hc:skillLog", "edit", sessionRole, groupPresets);
}

export function canFillSkillLog(
  profile: AccessProfile | null | undefined,
  groupPresets?: GroupPresetsMap | null,
  sessionRole?: string | null,
): boolean {
  if (!profile) return false;

  const role = profile.role ?? sessionRole;
  // Only roles ever eligible to be someone's assigned supervisor (Executive
  // Role, Human Resource, Supervisory Role, or Super Admin) can fill a skill
  // log at all — WHICH employee's log they can actually fill is checked
  // separately per-employee in canFillSkillLogForEmployee below, via the
  // supervisor_id assignment. Standard, Consultant, and System Administrator
  // never fill logs.
  if (!canBeAssignedAsSupervisorByRoleLabel(role)) return false;

  return canPerformModuleAction(profile, "hc:skillLog", "add", sessionRole, groupPresets);
}

export function canFillSkillLogForEmployee(
  fillerUserId: string | null | undefined,
  employee: { supervisor_id?: string | null; grade_level?: string | null },
): boolean {
  if (isConsultantGrade(employee.grade_level)) return false;
  return isAssignedSupervisorOf(fillerUserId, employee);
}

export async function loadGroupPresetsForSkillLog(
  supabase: SupabaseClient | null,
): Promise<GroupPresetsMap> {
  if (!supabase) return {};
  const { presets } = await fetchGroupPresetsFromDb(supabase);
  return presets;
}
