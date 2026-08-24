import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { sendOnboardingInvite } from "@/lib/careers/sendOnboardingInvite";
import { normalizeInterviewFormData } from "@/lib/careers/types";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { application_id } = await req.json();
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

  if (application.status !== "onboarding") {
    return NextResponse.json(
      { error: "Resend is only available for applications in onboarding status." },
      { status: 400 },
    );
  }

  const formData = normalizeInterviewFormData(application.interview_form_data);
  if (formData.summary?.decision !== "hire") {
    return NextResponse.json(
      { error: "Onboarding link is only for hire decisions." },
      { status: 400 },
    );
  }

  try {
    const inviteResult = await sendOnboardingInvite(supabaseAdmin, application, {
      recommendedStartDate: formData.summary?.recommended_start_date,
      updateStatus: false,
    });

    return NextResponse.json({
      success: true,
      data: {
        expires_at: inviteResult.expiresAt,
        email_sent: inviteResult.emailSent,
      },
      email_warning: inviteResult.emailSent ? undefined : inviteResult.emailError,
    });
  } catch (err) {
    console.error("[POST /api/careers/onboarding/resend]", err);
    return NextResponse.json({ error: "Failed to resend onboarding link." }, { status: 500 });
  }
}
