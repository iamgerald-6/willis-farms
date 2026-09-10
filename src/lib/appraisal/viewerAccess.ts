import { canActOnTeamAppraisalsFromProfile } from "@/lib/appraisalAccess";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import type { ViewerContext } from "@/app/(dashboard)/dashboard/humanCapital/appraisal/component/appraisalTypes";

/** Build an access profile from the appraisal viewer context. */
export function accessProfileFromViewer(viewer: ViewerContext) {
  return resolveAccessProfile(
    {
      role: viewer.role,
      user_role_label: viewer.role,
      access_tier: viewer.accessTier,
      page_permission_levels: viewer.pagePermissionLevels,
      page_permission_actions: viewer.pagePermissionActions,
    },
    viewer.role,
  );
}

/** Whether this viewer may fill appraisals for assigned reports. */
export function viewerCanActOnTeamAppraisals(viewer: ViewerContext): boolean {
  return canActOnTeamAppraisalsFromProfile(
    accessProfileFromViewer(viewer),
    viewer.role,
  );
}
