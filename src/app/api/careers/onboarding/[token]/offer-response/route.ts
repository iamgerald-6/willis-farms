import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { validateOnboardingToken } from "@/lib/careers/onboardingTokens";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { sendOfferDeclinedToHrEmail } from "@/lib/careers/interviewEmails";

type RouteParams = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { token } = await params;
  const validation = await validateOnboardingToken(supabaseAdmin, token);
  if (!validation.ok) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 410 });
  }

  const body = (await req.json()) as { response?: string };
  const response = body.response === "declined" ? "declined" : body.response === "accepted" ? "accepted" : null;
  if (!response) {
    return NextResponse.json(
      { error: 'response must be "accepted" or "declined".' },
      { status: 400 },
    );
  }

  const { data: application, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select("id, full_name, email, role_title, reference_number, status")
    .eq("id", validation.applicationId)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (application.status !== "onboarding") {
    return NextResponse.json(
      { error: "This offer is no longer open for a response." },
      { status: 400 },
    );
  }

  const { data: submission } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("hr_data, form_data, submitted_at")
    .eq("application_id", validation.applicationId)
    .maybeSingle();

  if (submission?.submitted_at) {
    return NextResponse.json(
      { error: "Onboarding has already been submitted." },
      { status: 400 },
    );
  }

  const hr = (submission?.hr_data ?? {}) as OnboardingHrData;
  const existing = hr.offer_response;

  if (existing === "accepted" && response === "declined") {
    return NextResponse.json(
      { error: "You have already accepted this offer." },
      { status: 400 },
    );
  }
  if (existing === "declined") {
    return NextResponse.json(
      { error: "You have already declined this offer." },
      { status: 400 },
    );
  }
  if (existing === "accepted" && response === "accepted") {
    return NextResponse.json({
      success: true,
      data: { offer_response: "accepted", offer_response_at: hr.offer_response_at },
    });
  }

  const offer_response_at = new Date().toISOString();
  const nextHr: OnboardingHrData = {
    ...hr,
    offer_response: response,
    offer_response_at,
  };

  const { error: updateError } = await supabaseAdmin.from("onboarding_submissions").upsert(
    {
      application_id: validation.applicationId,
      form_data: submission?.form_data ?? {},
      hr_data: nextHr,
    },
    { onConflict: "application_id" },
  );

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (response === "declined") {
    await sendOfferDeclinedToHrEmail({
      candidateName: application.full_name,
      roleTitle: application.role_title,
      referenceNumber: application.reference_number,
      applicationId: application.id,
    });
  }

  return NextResponse.json({
    success: true,
    data: { offer_response: response, offer_response_at },
  });
}
