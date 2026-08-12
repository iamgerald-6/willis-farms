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

  if (isSuperAdmin(caller.role)) {
    return NextResponse.json({
      user_id: caller.id,
      role: caller.role,
      is_disabled: false,
      email_verified: true,
      staff_account_exists: true,
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
    });
  }

  return NextResponse.json({
    user_id: account.user_id,
    role: caller.role,
    is_disabled: !!account.is_disabled,
    email_verified: isEmailVerified(account),
    staff_account_exists: true,
    auth_block: getStaffAuthBlockReason(account),
  });
}
