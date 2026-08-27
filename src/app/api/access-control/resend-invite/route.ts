import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import {
  buildInviteEmail,
  sendViaResend,
} from "@/lib/email/resendClient";
import { getAppBaseUrl } from "@/lib/appUrl";
import { isSuperAdmin } from "@/lib/accessControl";
import { resolveApplicationDeliveryEmail } from "@/lib/careers/buildOnboardingInvitePrefill";

/**
 * Re-issues a setup email for a user who hasn't verified yet
 * (email_verified = false). Same access level as creating a user (add).
 */
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireUserManagementAccess(req, "add");
  if (!caller) {
    return jsonForbidden(
      "Forbidden — User Management add or edit access required.",
    );
  }

  try {
    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return NextResponse.json(
        { error: "Missing target_user_id" },
        { status: 400 },
      );
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from("users")
      .select(
        "user_id, email, first_name, role, email_verified, is_disabled, application_id",
      )
      .eq("user_id", target_user_id)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 });
    }
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (isSuperAdmin(target.role)) {
      return NextResponse.json({ error: "Invalid target" }, { status: 403 });
    }

    if (target.is_disabled) {
      return NextResponse.json(
        { error: "Cannot resend email to a disabled account." },
        { status: 400 },
      );
    }

    if (target.email_verified) {
      return NextResponse.json(
        { error: "This user has already finished setting up their account." },
        { status: 400 },
      );
    }

    const redirectTo = `${getAppBaseUrl()}/set-password`;

    let { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email: target.email,
        options: {
          redirectTo,
          data: { role: target.role },
        },
      });

    if (linkError) {
      const retry = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: target.email,
        options: { redirectTo },
      });
      linkData = retry.data;
      linkError = retry.error;
    }

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      return NextResponse.json(
        { error: "Could not generate setup link." },
        { status: 500 },
      );
    }

    // The invite must be delivered to the person's own (personal/job-application)
    // inbox, not their new WillsOne company account — they can't check that
    // email yet since they haven't finished setting it up. Look up the personal
    // email from their job application/onboarding record when there is one;
    // fall back to the account email for users added without an application
    // (e.g. added directly in User Management with no onboarding record).
    let deliveryEmail = target.email;
    if (target.application_id) {
      const { data: application } = await supabaseAdmin
        .from("job_applications")
        .select("email")
        .eq("id", target.application_id)
        .maybeSingle();

      const { data: submission } = await supabaseAdmin
        .from("onboarding_submissions")
        .select("form_data")
        .eq("application_id", target.application_id)
        .maybeSingle();

      const personalEmail = resolveApplicationDeliveryEmail({
        application_email: application?.email ?? null,
        form_data: submission?.form_data ?? null,
      });

      if (personalEmail) deliveryEmail = personalEmail;
    }

    const mail = buildInviteEmail(actionLink, target.first_name ?? "");
    const sendResult = await sendViaResend({ to: deliveryEmail, ...mail });

    if (!sendResult.sent) {
      return NextResponse.json(
        { error: sendResult.error ?? "Failed to send email." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/access-control/resend-invite]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
