import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAuth, jsonForbidden } from "@/lib/apiRequestAuth";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import {
  consultantDisplayName,
  isHeadConsultant,
  isSubordinateConsultant,
  loadConsultantUserProfile,
} from "@/lib/careers/consultantHrApproval";
import {
  sendConsultantOnboardingApprovalEmail,
  sendOnboardingHrReviewSubmittedEmail,
} from "@/lib/careers/interviewEmails";

/** HR officer submits onboarding review for sign-off (senior HR or consultant supervisor). */
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const caller = await requireAuth(req);
  if (!caller) {
    return jsonForbidden("Sign in required.");
  }

  const callerProfile = await loadConsultantUserProfile(supabaseAdmin, caller.id);
  if (!callerProfile) {
    return NextResponse.json({ error: "User profile not found." }, { status: 404 });
  }

  const {
    application_id,
    hr_data,
  }: { application_id?: string; hr_data?: OnboardingHrData } = await req.json();

  if (!application_id) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  if (isHeadConsultant(callerProfile)) {
    return NextResponse.json(
      {
        error:
          "As a head consultant, approve directly with the checkbox on this page — no separate submission is needed.",
      },
      { status: 400 },
    );
  }

  const { data: submission, error: submissionError } = await supabaseAdmin
    .from("onboarding_submissions")
    .select(
      `
      submitted_at,
      hr_data,
      job_applications (
        full_name,
        role_title,
        reference_number
      )
    `,
    )
    .eq("application_id", application_id)
    .maybeSingle();

  if (submissionError || !submission) {
    return NextResponse.json({ error: "Onboarding record not found." }, { status: 404 });
  }

  if (!submission.submitted_at) {
    return NextResponse.json(
      { error: "Candidate has not submitted onboarding yet." },
      { status: 400 },
    );
  }

  const existingHr = (submission.hr_data ?? {}) as OnboardingHrData;
  if (existingHr.platform_invited_at?.trim() || existingHr.hr_finished_at?.trim()) {
    return NextResponse.json(
      { error: "Onboarding is already complete for this candidate." },
      { status: 400 },
    );
  }

  const mergedHr: OnboardingHrData = {
    ...existingHr,
    ...(hr_data ?? {}),
  };

  if (!mergedHr.hr_notes?.trim()) {
    return NextResponse.json(
      { error: "Add HR review notes before submitting for approval." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const reviewedBy = callerProfile
    ? consultantDisplayName(callerProfile)
    : caller.name.trim() || caller.email || caller.id;

  const nextHr: OnboardingHrData = {
    ...mergedHr,
    hr_review_submitted_at: now,
    hr_reviewed_by: reviewedBy,
  };

  const rawApp = submission.job_applications;
  const app = (Array.isArray(rawApp) ? rawApp[0] : rawApp) as {
    full_name: string;
    role_title: string;
    reference_number: string;
  } | null;

  if (isSubordinateConsultant(callerProfile)) {
    const supervisorId = callerProfile.supervisor_id!.trim();
    nextHr.hr_review_mode = "consultant";
    nextHr.hr_approval_supervisor_id = supervisorId;

    const { data: supervisor } = await supabaseAdmin
      .from("users")
      .select("email, first_name, last_name")
      .eq("user_id", supervisorId)
      .maybeSingle();

    const { error: updateError } = await supabaseAdmin
      .from("onboarding_submissions")
      .update({ hr_data: nextHr })
      .eq("application_id", application_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (app?.full_name && supervisor?.email) {
      await sendConsultantOnboardingApprovalEmail({
        candidateName: app.full_name,
        roleTitle: app.role_title,
        referenceNumber: app.reference_number,
        applicationId: application_id,
        reviewedBy,
        supervisorEmail: supervisor.email,
        supervisorName:
          `${supervisor.first_name ?? ""} ${supervisor.last_name ?? ""}`.trim() ||
          supervisor.email,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        hr_review_submitted_at: now,
        hr_reviewed_by: nextHr.hr_reviewed_by,
        hr_approval_supervisor_id: supervisorId,
      },
    });
  }

  nextHr.hr_review_mode = "senior_hr";

  const { error: updateError } = await supabaseAdmin
    .from("onboarding_submissions")
    .update({ hr_data: nextHr })
    .eq("application_id", application_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (app?.full_name) {
    await sendOnboardingHrReviewSubmittedEmail({
      candidateName: app.full_name,
      roleTitle: app.role_title,
      referenceNumber: app.reference_number,
      applicationId: application_id,
      reviewedBy: nextHr.hr_reviewed_by ?? "HR",
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      hr_review_submitted_at: now,
      hr_reviewed_by: nextHr.hr_reviewed_by,
    },
  });
}
