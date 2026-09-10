import type { NextRequest } from "next/server";
import {
  getApiRequestUser,
  type ApiRequestUser,
} from "@/lib/apiRequestAuth";
import { resolveAccessProfile, type AccessProfile } from "@/lib/pagePermissions";
import { fetchGroupPresetsFromDb, type GroupPresetsMap } from "@/lib/groupPermissionPresets";
import { canPerformModuleAction } from "@/lib/permissionActions";
import {
  hasBroadElevatedAccessByRoleLabel,
  isExecutiveRoleLabel,
  isHumanResourceRoleLabel,
  isSuperAdminRoleLabel,
  isSupervisoryRoleLabel,
} from "@/lib/userRoleAccessControl";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type LeaveReviewScope = "all" | "reports";

/** Where a leave request's two-stage approval currently sits. See
 * docs/leave/two-stage-approval.sql. */
export type LeaveStage =
  | "pending_supervisor"
  | "pending_signoff"
  | "approved"
  | "rejected";

/** The stage a brand-new leave request should start at: stage 1 (supervisor)
 * when the applicant has one assigned, otherwise straight to stage 2
 * (HR/Executive sign-off) — re-evaluated fresh on every application, not
 * hardcoded per role, so assigning a supervisor later automatically routes
 * that employee's next request through the normal two-stage flow. */
export function resolveInitialLeaveStage(
  applicantSupervisorId: string | null | undefined,
): LeaveStage {
  return applicantSupervisorId ? "pending_supervisor" : "pending_signoff";
}

export type LeaveAuthContext = {
  user: ApiRequestUser;
  profile: AccessProfile;
  presets: GroupPresetsMap;
  scope: LeaveReviewScope;
};

function callerAccessProfile(user: ApiRequestUser): AccessProfile {
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

function hasLeaveReviewOrApprovePermission(
  profile: AccessProfile,
  role: string | null | undefined,
  presets: GroupPresetsMap,
): boolean {
  return (
    canPerformModuleAction(profile, "hc:leave", "review", role, presets) ||
    canPerformModuleAction(profile, "hc:leave", "approve", role, presets)
  );
}

/** Whether the caller may open the leave review queue at all. */
export function resolveLeaveReviewScope(
  profile: AccessProfile,
  role: string | null | undefined,
  presets: GroupPresetsMap,
): LeaveReviewScope | null {
  if (isSuperAdminRoleLabel(role) || hasBroadElevatedAccessByRoleLabel(role)) {
    return "all";
  }

  if (isSupervisoryRoleLabel(role)) {
    return "reports";
  }

  if (hasLeaveReviewOrApprovePermission(profile, role, presets)) {
    return "all";
  }

  return null;
}

/** Stage 1 — the employee's assigned supervisor approves/rejects first.
 * Super Admin can also act at this stage as an override, same as every
 * other approval gate in the app. */
export function canApproveLeaveSupervisorStage(
  callerId: string,
  requesterUserId: string,
  requesterSupervisorId: string | null | undefined,
  role: string | null | undefined,
): boolean {
  if (callerId === requesterUserId) return false;
  if (isSuperAdminRoleLabel(role)) return true;
  return isSupervisoryRoleLabel(role) && requesterSupervisorId === callerId;
}

/** Stage 2 — final sign-off, once the supervisor stage is done (or skipped,
 * for an applicant with no supervisor assigned). Human Resource or
 * Executive Role can sign off for most employees; if the applicant IS
 * Human Resource or Executive Role themselves, only Executive Role can sign
 * off (self-approval is already blocked above, so a lone Executive Role
 * applicant simply has no one else who can sign off yet). Super Admin can
 * also act at this stage as an override. */
export function canApproveLeaveSignoffStage(
  callerId: string,
  requesterUserId: string,
  requesterRoleLabel: string | null | undefined,
  callerRoleLabel: string | null | undefined,
): boolean {
  if (callerId === requesterUserId) return false;
  if (isSuperAdminRoleLabel(callerRoleLabel)) return true;

  if (
    isHumanResourceRoleLabel(requesterRoleLabel) ||
    isExecutiveRoleLabel(requesterRoleLabel)
  ) {
    return isExecutiveRoleLabel(callerRoleLabel);
  }

  return (
    isHumanResourceRoleLabel(callerRoleLabel) ||
    isExecutiveRoleLabel(callerRoleLabel)
  );
}

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getLeaveAuthContext(
  req: NextRequest,
): Promise<LeaveAuthContext | null> {
  const user = await getApiRequestUser(req);
  if (!user) return null;

  const supabaseAdmin = getAdminClient();
  const { presets } = supabaseAdmin
    ? await fetchGroupPresetsFromDb(supabaseAdmin)
    : { presets: {} };

  const profile = callerAccessProfile(user);
  const scope = resolveLeaveReviewScope(profile, user.role, presets);
  if (!scope) return null;

  return { user, profile, presets, scope };
}

export async function loadDirectReportUserIds(
  supabaseAdmin: SupabaseClient,
  supervisorUserId: string,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id")
    .eq("supervisor_id", supervisorUserId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.user_id);
}
