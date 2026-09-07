import { isConsultantGrade } from "@/lib/systemDefinitions/gradeLevelsConfig";
import { fetchGroupPresetsFromDb, type GroupPresetsMap } from "@/lib/groupPermissionPresets";
import { canPerformModuleAction } from "@/lib/permissionActions";
import type { AccessProfile } from "@/lib/pagePermissions";
import { isAssignedSupervisorOf } from "@/lib/supervisorAssignment";
import {
  canBeAssignedAsSupervisorByRoleLabel,
  isSuperAdminRoleLabel,
  isSupervisoryRoleLabel,
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
  hasSupervisees = false,
): boolean {
  if (!profile || !userId) return false;
  if (!canPerformModuleAction(profile, "hc:skillLog", "view", sessionRole, groupPresets)) {
    return false;
  }

  const empId = employeeId(log);
  const supId = supervisorId(log);

  // Employee or filler always sees their own involvement
  if (empId === userId || supId === userId) return true;

  // Reviewers see all submitted / signed-off logs
  if (
    (log.status === "submitted" || log.status === "signed_off") &&
    canPerformModuleAction(profile, "hc:skillLog", "review", sessionRole, groupPresets)
  ) {
    return true;
  }

  // Approvers see submitted logs they may sign off, and signed-off logs they reviewed
  if (
    supId !== userId &&
    canPerformModuleAction(profile, "hc:skillLog", "approve", sessionRole, groupPresets)
  ) {
    if (log.status === "signed_off") return true;
    if (log.status === "submitted" && canSignOffSkillLogEffective(profile, hasSupervisees)) {
      return true;
    }
  }

  return false;
}

/**
 * Whether `profile` may sign off a submitted log — Super Admin always can;
 * everyone else must actually hold the Supervisory Role AND have at least
 * one employee assigned to them (supervisor_id) — a Supervisory-role label
 * with nobody reporting to them doesn't qualify. This is a distinct admin/
 * review capability, separate from who actually FILLS a specific employee's
 * log (always their own assigned supervisor — see canFillSkillLogForEmployee
 * below), and from `hasSupervisees`, which the caller must compute (see
 * hasAssignedSupervisees below).
 */
function canSignOffSkillLogEffective(
  profile: AccessProfile,
  hasSupervisees: boolean,
): boolean {
  if (isSuperAdminRoleLabel(profile.role)) return true;
  return isSupervisoryRoleLabel(profile.role) && hasSupervisees;
}

export function canApproveSkillLogRecord(
  profile: AccessProfile | null | undefined,
  userId: string,
  log: SkillLogRecord,
  groupPresets?: GroupPresetsMap | null,
  sessionRole?: string | null,
  hasSupervisees = false,
): boolean {
  if (!profile || !userId) return false;
  if (log.status !== "submitted") return false;

  const supId = supervisorId(log);
  if (!supId || supId === userId) return false;

  if (!canPerformModuleAction(profile, "hc:skillLog", "approve", sessionRole, groupPresets)) {
    return false;
  }

  return canSignOffSkillLogEffective(profile, hasSupervisees);
}

/** Whether `userId` currently has at least one employee assigned to them as
 * supervisor_id — required alongside the Supervisory Role label itself for
 * sign-off/approval eligibility (see canSignOffSkillLogEffective above). */
export async function hasAssignedSupervisees(
  supabase: SupabaseClient | null,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!supabase || !userId) return false;
  const { data } = await supabase
    .from("users")
    .select("user_id")
    .eq("supervisor_id", userId)
    .limit(1);
  return !!data && data.length > 0;
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
