import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  mergeOnboardingForm,
  type OnboardingFormData,
  type OnboardingStep,
} from "@/lib/careers/onboardingTypes";
import {
  validateOnboardingToken,
} from "@/lib/careers/onboardingTokens";
import { sendOnboardingSubmittedEmail } from "@/lib/careers/interviewEmails";

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { token } = await params;
  const validation = await validateOnboardingToken(supabaseAdmin, token);
  if (!validation.ok) {
    const messages = {
      not_found: "This onboarding link is invalid.",
      revoked: "This onboarding link has been replaced. Check your email for the latest link.",
      expired: "This onboarding link has expired. Contact HR to request a new link.",
    };
    return NextResponse.json(
      { error: messages[validation.reason] },
      { status: validation.reason === "not_found" ? 404 : 410 },
    );
  }

  const { data: application, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select(
      "id, full_name, email, phone, role_title, reference_number, status, location",
    )
    .eq("id", validation.applicationId)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const { data: submission } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("*")
    .eq("application_id", validation.applicationId)
    .maybeSingle();

  if (submission?.submitted_at) {
    return NextResponse.json({
      success: true,
      data: {
        application,
        submitted: true,
        submitted_at: submission.submitted_at,
        expires_at: validation.expiresAt,
      },
    });
  }

  const formData = mergeOnboardingForm(submission?.form_data as OnboardingFormData);
  if (!formData.employment?.position_title) {
    formData.employment = {
      ...formData.employment,
      position_title: application.role_title,
    };
  }
  if (!formData.personal?.personal_email) {
    formData.personal = {
      ...formData.personal,
      personal_email: application.email,
    };
  }
  if (!formData.personal?.mobile && application.phone) {
    formData.personal = {
      ...formData.personal,
      mobile: application.phone,
    };
  }

  return NextResponse.json({
    success: true,
    data: {
      application,
      submitted: false,
      form_data: formData,
      personal_completed_at: submission?.personal_completed_at ?? null,
      medical_completed_at: submission?.medical_completed_at ?? null,
      referee_completed_at: submission?.referee_completed_at ?? null,
      expires_at: validation.expiresAt,
    },
  });
}

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

  const body = await req.json();
  const {
    step,
    form_data,
    finalize,
  }: {
    step?: OnboardingStep;
    form_data: OnboardingFormData;
    finalize?: boolean;
  } = body;

  const { data: existing } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("*")
    .eq("application_id", validation.applicationId)
    .maybeSingle();

  if (existing?.submitted_at) {
    return NextResponse.json(
      { error: "Onboarding has already been submitted." },
      { status: 400 },
    );
  }

  const merged = mergeOnboardingForm({
    ...(existing?.form_data as OnboardingFormData),
    ...form_data,
  });

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    application_id: validation.applicationId,
    token_id: validation.tokenId,
    form_data: merged,
  };

  if (step === "personal") updates.personal_completed_at = now;
  if (step === "medical") updates.medical_completed_at = now;
  if (step === "referee" && finalize) {
    updates.referee_completed_at = now;
    updates.submitted_at = now;
  }

  const { data: submission, error } = await supabaseAdmin
    .from("onboarding_submissions")
    .upsert(updates, { onConflict: "application_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (finalize) {
    const { data: application } = await supabaseAdmin
      .from("job_applications")
      .update({ status: "offer" })
      .eq("id", validation.applicationId)
      .select("full_name, role_title, reference_number")
      .single();

    if (application) {
      await sendOnboardingSubmittedEmail({
        candidateName: application.full_name,
        roleTitle: application.role_title,
        referenceNumber: application.reference_number,
        applicationId: validation.applicationId,
      });
    }
  }

  return NextResponse.json({ success: true, data: submission });
}
