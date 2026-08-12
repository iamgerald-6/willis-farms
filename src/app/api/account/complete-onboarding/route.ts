import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAuth, jsonUnauthorized } from "@/lib/apiRequestAuth";
import { isEmailVerified } from "@/lib/userAccountStatus";
import { lookupStaffByUserId } from "@/lib/staffAccount";
import { updateUserWithColumnFallback } from "@/lib/supabaseUserUpdate";

/**
 * Called once, right after a newly-invited user successfully saves their
 * password (see setPassword.tsx) — while their post-invite-link session is
 * still active, before we sign them out to force an explicit login. Sets
 * email_verified so User Management can show Pending vs Active.
 */
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireAuth(req);
  if (!caller) return jsonUnauthorized();

  const account = await lookupStaffByUserId(supabaseAdmin, caller.id);
  if (!account) {
    return NextResponse.json(
      { error: "Staff account not found." },
      { status: 404 },
    );
  }

  if (isEmailVerified(account)) {
    return NextResponse.json({ success: true, already_verified: true });
  }

  const { error } = await updateUserWithColumnFallback(
    supabaseAdmin,
    caller.id,
    { email_verified: true, email_confirm: true },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
