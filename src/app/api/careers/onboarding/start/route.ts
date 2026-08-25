import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { createOnboardingToken } from "@/lib/careers/onboardingTokens";
import { onboardingMagicLinkUrl } from "@/lib/appUrl";
import { sendHireOnboardingEmail } from "@/lib/careers/interviewEmails";
import { normalizeInterviewFormData, type JobApplication } from "@/lib/careers/types";
import { appendStatusHistory } from "@/lib/careers/statusHistory";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";

// Moves a hired applicant from "offer" to "onboarding" — creates their
// onboarding magic-link token, an onboarding_submissions row, and sends the
// congratulations email with the link. This used to happen automatically the
// moment Hire was confirmed; it's now a deliberate second step from the
// Employment tab, so HR can extend an offer without immediately committing
// the candidate to the onboarding clock.
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { application_id, started_by }: { application_id?: string; started_by?: string } =
    await req.json();
  if (!application_id) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  const { data: application, error } = await supabaseAdmin
    .from("job_applications")
    .select("*")
    .eq("id", application_id)
    .single();

  if (error || !application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const app = application as JobApplication;

  if (app.status !== "offer") {
    return NextResponse.json(
      { error: "Onboarding can only be started for an applicant with an outstanding offer." },
      { status: 400 },
    );
  }

  const formData = normalizeInterviewFormData(app.interview_form_data);
  if (formData.summary?.decision !== "hire") {
    return NextResponse.json(
      { error: "Onboarding is only for hire decisions." },
      { status: 400 },
    );
  }

  try {
    const { data: submission } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("hr_data")
      .eq("application_id", application_id)
      .maybeSingle();

    const hr = (submission?.hr_data ?? {}) as OnboardingHrData;

    if (!hr.offer_letter?.secure_url) {
      return NextResponse.json(
        {
          error:
            "Upload the signed offer letter before sending the onboarding link.",
        },
        { status: 400 },
      );
    }

    const tokenRecord = await createOnboardingToken(supabaseAdmin, application_id);
    const onboardingLink = onboardingMagicLinkUrl(tokenRecord.token);

    await supabaseAdmin.from("onboarding_submissions").upsert(
      {
        application_id,
        token_id: tokenRecord.id,
        form_data: {},
        hr_data: hr,
        submitted_at: null,
        personal_completed_at: null,
        medical_completed_at: null,
        referee_completed_at: null,
      },
      { onConflict: "application_id" },
    );

    const emailResult = await sendHireOnboardingEmail({
      candidateName: app.full_name,
      candidateEmail: app.email,
      roleTitle: app.role_title,
      referenceNumber: app.reference_number,
      onboardingLink,
      expiresAt: tokenRecord.expiresAt,
      recommendedStartDate: formData.summary?.recommended_start_date,
      offerLetter: hr.offer_letter?.secure_url
        ? {
            secure_url: hr.offer_letter.secure_url,
            original_name: hr.offer_letter.original_name,
          }
        : undefined,
    });

    const status_history = appendStatusHistory(app.status_history, "onboarding", started_by);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("job_applications")
      .update({ status: "onboarding", status_history })
      .eq("id", application_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: updated,
      email_warning: emailResult.sent ? undefined : emailResult.error,
    });
  } catch (err) {
    console.error("[POST /api/careers/onboarding/start]", err);
    return NextResponse.json({ error: "Failed to start onboarding." }, { status: 500 });
  }
}
