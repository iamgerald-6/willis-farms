import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  buildPasswordResetEmail,
  sendViaResend,
} from "@/lib/email/resendClient";
import { getAppBaseUrl } from "@/lib/appUrl";
import {
  getStaffAuthBlockReason,
  lookupStaffByEmail,
  staffAuthBlockMessage,
} from "@/lib/staffAccount";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const { email } = await req.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalized || !normalized.includes("@")) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
    }

    const account = await lookupStaffByEmail(supabaseAdmin, normalized);
    const block = getStaffAuthBlockReason(account);
    if (block) {
      return NextResponse.json(
        { error: staffAuthBlockMessage(block), code: block },
        { status: 403 },
      );
    }

    const redirectTo = `${getAppBaseUrl()}/set-password`;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: normalized,
      options: { redirectTo },
    });

    if (error) {
      console.warn("[forgot-password] generateLink:", error.message);
      return NextResponse.json(
        { error: "Could not send reset email. Try again later." },
        { status: 500 },
      );
    }

    const actionLink = data.properties?.action_link;
    if (!actionLink) {
      console.warn("[forgot-password] No action_link returned");
      return NextResponse.json(
        { error: "Could not send reset email. Try again later." },
        { status: 500 },
      );
    }

    const mail = buildPasswordResetEmail(actionLink);
    const result = await sendViaResend({
      to: normalized,
      ...mail,
    });

    if (!result.sent) {
      console.error("[forgot-password] Resend failed:", result.error);
      return NextResponse.json(
        { error: "Could not send reset email. Try again later." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/auth/forgot-password]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
