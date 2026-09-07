import { canSignOffSkillLog } from "@/lib/accessControl";
import { isConsultantGrade } from "@/lib/systemDefinitions/gradeLevelsConfig";
import { fetchGroupPresetsFromDb, type GroupPresetsMap } from "@/lib/groupPermissionPresets";
import { canPerformModuleAction } from "@/lib/permissionActions";
import type { AccessProfile } from "@/lib/pagePermissions";
import { isAssignedSupervisorOf } from "@/lib/supervisorAssignment";
import {
  canBeAssignedAsSupervisorByRoleLabel,
  hasBroadElevatedAccessByRoleLabel,
  isKnownUserRoleLabel,
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

function fillerGrade(log: SkillLogRecord): string | null | undefined {
  return log.supervisor?.grade_level;
}

export function canViewSkillLogRecord(
  profile: AccessProfile | null | undefined,
  userId: string,
  log: SkillLogRecord,
  groupPresets?: GroupPresetsMap | null,
  sessionRole?: string | null,
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
    if (
      log.status === "submitted" &&
      canSignOffSkillLogEffective(profile, fillerGrade(log))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Whether `profile` may sign off a log filled by someone at `fillerGrade` —
 * Super Admin/Executive/Human Resource always can (broad, new role system);
 * everyone else not yet migrated to a resolved User role falls back to the
 * old grade-rank comparison. Supervisory role's sign-off is not yet scoped
 * to specific supervisees here (falls back to grade rank too) — narrowing
 * this to supervisor_id like fill/appraise/leave is a known follow-up.
 */
function canSignOffSkillLogEffective(
  profile: AccessProfile,
  fillerGrade: string | null | undefined,
): boolean {
  if (hasBroadElevatedAccessByRoleLabel(profile.role)) return true;
  return canSignOffSkillLog(profile.grade_level, fillerGrade);
}

export function canApproveSkillLogRecord(
  profile: AccessProfile | null | undefined,
  userId: string,
  log: SkillLogRecord,
  groupPresets?: GroupPresetsMap | null,
  sessionRole?: string | null,
): boolean {
  if (!profile || !userId) return false;
  if (log.status !== "submitted") return false;

  const supId = supervisorId(log);
  if (!supId || supId === userId) return false;

  if (!canPerformModuleAction(profile, "hc:skillLog", "approve", sessionRole, groupPresets)) {
    return false;
  }

  return canSignOffSkillLogEffective(profile, fillerGrade(log));
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
  if (isKnownUserRoleLabel(role)) {
    // New role system: Super Admin/Executive/Human Resource fill broadly;
    // Supervisory fills for their supervisees (checked per-employee in
    // canFillSkillLogForEmployee below, via the same eligible-supervisor
    // role set). Standard/Consultant/System Administrator don't fill at all.
    if (
      !hasBroadElevatedAccessByRoleLabel(role) &&
      !canBeAssignedAsSupervisorByRoleLabel(role)
    ) {
      return false;
    }
  } else {
    if (isConsultantGrade(profile.grade_level)) return false;
    const gradeNum = parseInt(String(profile.grade_level ?? "").replace(/\D/g, ""), 10) || 0;
    if (gradeNum < 4) return false; // L4+ fills logs (SKILL_LOG_MIN_FILLER_GRADE)
  }

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
