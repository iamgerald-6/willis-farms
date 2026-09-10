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
  isSuperAdminRoleLabel,
  isSupervisoryRoleLabel,
} from "@/lib/userRoleAccessControl";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type LeaveReviewScope = "all" | "reports";

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

/** Whether the caller may approve/reject a specific employee's leave request. */
export function canApproveLeaveRequest(
  callerId: string,
  requesterUserId: string,
  requesterSupervisorId: string | null | undefined,
  profile: AccessProfile,
  role: string | null | undefined,
  presets: GroupPresetsMap,
): boolean {
  if (callerId === requesterUserId) return false;

  if (isSuperAdminRoleLabel(role) || hasBroadElevatedAccessByRoleLabel(role)) {
    return true;
  }

  const isAssignedSupervisor = requesterSupervisorId === callerId;

  if (isSupervisoryRoleLabel(role) && isAssignedSupervisor) {
    return true;
  }

  if (
    isAssignedSupervisor &&
    canPerformModuleAction(profile, "hc:leave", "approve", role, presets)
  ) {
    return true;
  }

  return false;
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
