import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAuth, jsonForbidden } from "@/lib/apiRequestAuth";
import { hasBroadElevatedAccessByRoleLabel } from "@/lib/userRoleAccessControl";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import {
  sendOfferLetterApprovalRequestEmail,
  sendOfferLetterSubmittedNoticeEmail,
} from "@/lib/careers/offerLetterEmails";

function canManageOfferLetters(
  caller: NonNullable<Awaited<ReturnType<typeof requireAuth>>>,
): boolean {
  if (hasBroadElevatedAccessByRoleLabel(caller.role)) return true;
  if (caller.page_permissions?.includes("hc:recruitment")) return true;
  const recruitmentActions = caller.page_permission_actions?.["hc:recruitment"];
  if (recruitmentActions?.edit || recruitmentActions?.add) return true;
  const recruitmentLevel = caller.page_permission_levels?.["hc:recruitment"];
  return recruitmentLevel === "edit" || recruitmentLevel === "add";
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const caller = await requireAuth(req);
  if (!caller) {
    return jsonForbidden("Sign in required.");
  }

  if (!canManageOfferLetters(caller)) {
    return jsonForbidden("Recruitment edit access required.");
  }

  const body = await req.json();
  const {
    application_id,
    notice_recipient_user_ids,
    send_notice = true,
    send_approval_request,
    signer_user_id,
  }: {
    application_id?: string;
    notice_recipient_user_ids?: string[];
    send_notice?: boolean;
    send_approval_request?: boolean;
    signer_user_id?: string;
  } = body;

  if (!application_id) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  const noticeIds = Array.isArray(notice_recipient_user_ids)
    ? notice_recipient_user_ids.filter((id) => typeof id === "string" && id.trim())
    : [];

  if (send_notice && noticeIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one executive or HR colleague to notify." },
      { status: 400 },
    );
  }

  if (send_approval_request && !signer_user_id) {
    return NextResponse.json(
      { error: "signer_user_id is required for approval requests." },
      { status: 400 },
    );
  }

  const { data: application, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select("id, status, full_name, role_title, reference_number")
    .eq("id", application_id)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (application.status !== "offer") {
    return NextResponse.json(
      { error: "Offer letter notifications can only be sent while the applicant is on Offer." },
      { status: 400 },
    );
  }

  const { data: submission } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("hr_data, form_data")
    .eq("application_id", application_id)
    .maybeSingle();

  const hr = (submission?.hr_data ?? {}) as OnboardingHrData;
  const pdfUrl = hr.offer_letter?.secure_url?.trim();
  if (!pdfUrl) {
    return NextResponse.json(
      { error: "Save the offer letter PDF before sending notifications." },
      { status: 400 },
    );
  }

  const pdfFilename =
    hr.offer_letter?.original_name?.trim() ||
    `offer-letter-${application.reference_number}.pdf`;

  const { data: callerRow } = await supabaseAdmin
    .from("users")
    .select("first_name, last_name, job_position")
    .eq("user_id", caller.id)
    .maybeSingle();

  const submittedByName =
    callerRow
      ? `${callerRow.first_name ?? ""} ${callerRow.last_name ?? ""}`.trim()
      : caller.name;
  const submittedByTitle = callerRow?.job_position?.trim() || caller.role;

  const userIdsToLoad = new Set(noticeIds);
  if (send_approval_request && signer_user_id) {
    userIdsToLoad.add(signer_user_id);
  }

  if (userIdsToLoad.size === 0) {
    return NextResponse.json({ error: "No recipients to email." }, { status: 400 });
  }

  const { data: users, error: usersError } = await supabaseAdmin
    .from("users")
    .select("user_id, email, first_name, last_name, job_position, is_disabled")
    .in("user_id", [...userIdsToLoad]);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const byId = new Map((users ?? []).map((u) => [u.user_id, u]));

  const noticeEmails = noticeIds
    .map((id) => byId.get(id))
    .filter((u) => u && !u.is_disabled && u.email?.trim())
    .map((u) => u!.email!.trim());

  if (send_notice && noticeEmails.length === 0) {
    return NextResponse.json(
      { error: "Selected notice recipients have no email on file." },
      { status: 400 },
    );
  }

  const emailParams = {
    submittedByName,
    submittedByTitle,
    candidateName: application.full_name,
    roleTitle: application.role_title,
    referenceNumber: application.reference_number,
    applicationId: application_id,
    pdfUrl,
    pdfFilename,
  };

  let noticeResult: { sent: boolean; error?: string } | null = null;

  if (send_notice) {
    noticeResult = await sendOfferLetterSubmittedNoticeEmail({
      ...emailParams,
      recipientEmails: noticeEmails,
    });
  }

  let approvalResult: { sent: boolean; error?: string } | null = null;

  if (send_approval_request && signer_user_id && signer_user_id !== caller.id) {
    const signer = byId.get(signer_user_id);
    if (!signer?.email?.trim() || signer.is_disabled) {
      return NextResponse.json(
        { error: "The selected signer has no email on file." },
        { status: 400 },
      );
    }

    const signerCc = noticeEmails.filter(
      (email) => email.toLowerCase() !== signer.email!.trim().toLowerCase(),
    );

    approvalResult = await sendOfferLetterApprovalRequestEmail({
      ...emailParams,
      signerEmail: signer.email.trim(),
      signerName: `${signer.first_name ?? ""} ${signer.last_name ?? ""}`.trim(),
      signerTitle: signer.job_position,
      ccEmails: signerCc.length ? signerCc : undefined,
    });
  }

  if (!send_notice && !send_approval_request) {
    return NextResponse.json(
      { error: "Nothing to send — enable notice or approval request." },
      { status: 400 },
    );
  }

  const warnings: string[] = [];
  if (noticeResult && !noticeResult.sent) {
    warnings.push(noticeResult.error ?? "Notice email failed to send.");
  }
  if (approvalResult && !approvalResult.sent) {
    warnings.push(approvalResult.error ?? "Approval request email failed to send.");
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("onboarding_submissions")
    .upsert(
      {
        application_id,
        form_data: submission?.form_data ?? {},
        hr_data: {
          ...hr,
          ...(noticeResult?.sent
            ? {
                offer_letter_notice_sent_at: now,
                offer_letter_notice_recipient_ids: noticeIds,
              }
            : {}),
          offer_letter_approval_requested_at:
            approvalResult?.sent ? now : hr.offer_letter_approval_requested_at,
        },
      },
      { onConflict: "application_id" },
    );

  if (warnings.length) {
    return NextResponse.json({
      success: true,
      warning: warnings.join(" "),
      data: {
        notice_sent: noticeResult?.sent ?? false,
        approval_sent: approvalResult?.sent ?? false,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      notice_sent: noticeResult?.sent ?? false,
      approval_sent: approvalResult?.sent ?? false,
    },
  });
}
