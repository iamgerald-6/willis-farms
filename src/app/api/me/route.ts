import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireAuth,
  jsonUnauthorized,
} from "@/lib/apiRequestAuth";
import { isSuperAdmin } from "@/lib/accessControl";
import { isEmailVerified } from "@/lib/userAccountStatus";
import {
  getStaffAuthBlockReason,
  lookupStaffByUserId,
} from "@/lib/staffAccount";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireAuth(req);
  if (!caller) return jsonUnauthorized();

  // Site scope, for any frontend UI that needs to know whether this caller
  // is ALL_SITES (headquarters) or locked to their own site — e.g. only
  // offering a site picker where ALL_SITES actually permits one (see
  // src/components/SiteTagPicker.tsx). Already resolved on ApiRequestUser
  // (see src/lib/siteAccess.ts), no extra query needed. site_id is
  // stringified here — sites.id is a real integer column (the one
  // non-uuid list in the org-structure system), but every frontend
  // consumer of a site id, including this one, treats ids as strings
  // (HTML <select> values, Set membership against the now-string-
  // normalized site catalog — see normalizeListItemRow in
  // organizationalStructureCustomLists.ts). Leaving this as a raw number
  // is what caused a saved org-placement to silently show "Not set" for
  // a non-headquarters user's own site badge.
  const siteScope = {
    site_id: caller.site_id != null ? String(caller.site_id) : null,
    is_headquarters_site: caller.is_headquarters_site,
  };

  if (isSuperAdmin(caller.role)) {
    return NextResponse.json({
      user_id: caller.id,
      role: caller.role,
      is_disabled: false,
      email_verified: true,
      staff_account_exists: true,
      ...siteScope,
    });
  }

  const account = await lookupStaffByUserId(supabaseAdmin, caller.id);

  if (!account) {
    return NextResponse.json({
      user_id: caller.id,
      role: caller.role,
      is_disabled: false,
      email_verified: false,
      staff_account_exists: false,
      ...siteScope,
    });
  }

  return NextResponse.json({
    user_id: account.user_id,
    role: caller.role,
    is_disabled: !!account.is_disabled,
    email_verified: isEmailVerified(account),
    staff_account_exists: true,
    auth_block: getStaffAuthBlockReason(account),
    ...siteScope,
  });
}
