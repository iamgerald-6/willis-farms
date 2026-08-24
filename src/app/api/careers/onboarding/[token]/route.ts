import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  mergeOnboardingForm,
  type OnboardingFormData,
  type OnboardingStep,
} from "@/lib/careers/onboardingTypes";
import {
  applyOnboardingPrefill,
  deriveCitizenshipFromApplication,
  flatToOnboardingForm,
  getDefaultOnboardingFormFieldsFallback,
  mergeOnboardingFieldDefinitions,
  onboardingFormToFlat,
  validateOnboardingMedicalExtras,
  validateOnboardingStep,
  ONBOARDING_STEPS,
} from "@/lib/careers/onboardingFormSchema";
import {
  fetchOnboardingFormFields,
  fetchOnboardingOptionLists,
  getGitOnboardingOptionLists,
} from "@/lib/careers/getOnboardingFormFields";
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
      "id, full_name, email, phone, role_title, reference_number, status, location, application_form_data",
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
        application: {
          full_name: application.full_name,
          email: application.email,
          phone: application.phone,
          role_title: application.role_title,
          reference_number: application.reference_number,
        },
        submitted: true,
        submitted_at: submission.submitted_at,
        expires_at: validation.expiresAt,
        application_form_data: application.application_form_data,
        form_data: mergeOnboardingForm(submission.form_data as OnboardingFormData),
      },
    });
  }

  const formData = mergeOnboardingForm(submission?.form_data as OnboardingFormData);

  let fields;
  let optionLists;
  try {
    [fields, optionLists] = await Promise.all([
      fetchOnboardingFormFields(supabaseAdmin),
      fetchOnboardingOptionLists(supabaseAdmin),
    ]);
  } catch {
    fields = getDefaultOnboardingFormFieldsFallback();
    optionLists = getGitOnboardingOptionLists();
  }

  const initialFlat = applyOnboardingPrefill(formData, {
    full_name: application.full_name,
    email: application.email,
    phone: application.phone ?? "",
    role_title: application.role_title,
    location: application.location,
    application_form_data: application.application_form_data as Record<string, unknown> | null,
  });

  return NextResponse.json({
    success: true,
    data: {
      application: {
        full_name: application.full_name,
        email: application.email,
        phone: application.phone,
        role_title: application.role_title,
        reference_number: application.reference_number,
      },
      submitted: false,
      application_form_data: application.application_form_data,
      form_data: flatToOnboardingForm(initialFlat),
      initial_flat: initialFlat,
      fields,
      option_lists: optionLists,
      personal_completed_at: submission?.personal_completed_at ?? null,
      medical_completed_at: submission?.medical_completed_at ?? null,
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

  const { data: application } = await supabaseAdmin
    .from("job_applications")
    .select("full_name, email, phone, application_form_data")
    .eq("id", validation.applicationId)
    .single();

  const citizenship = deriveCitizenshipFromApplication(
    application?.application_form_data as Record<string, unknown> | null,
  );
  if (citizenship) {
    merged.personal = { ...merged.personal, is_citizen: citizenship };
  }

  let fields;
  let optionLists;
  try {
    [fields, optionLists] = await Promise.all([
      fetchOnboardingFormFields(supabaseAdmin),
      fetchOnboardingOptionLists(supabaseAdmin),
    ]);
  } catch {
    fields = getDefaultOnboardingFormFieldsFallback();
    optionLists = getGitOnboardingOptionLists();
  }

  fields = mergeOnboardingFieldDefinitions(fields);

  const applicationContext = {
    application_form_data: application?.application_form_data as Record<string, unknown> | null,
    full_name: application?.full_name,
    email: application?.email,
    phone: application?.phone,
  };

  const flat = onboardingFormToFlat(merged);
  if (step) {
    const errors = validateOnboardingStep(
      fields,
      step,
      flat,
      optionLists,
      applicationContext,
    );
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 400 });
    }
  }

  if (finalize) {
    for (const s of ONBOARDING_STEPS) {
      const errors = validateOnboardingStep(
        fields,
        s,
        flat,
        optionLists,
        applicationContext,
      );
      if (errors.length > 0) {
        return NextResponse.json({ error: errors[0] }, { status: 400 });
      }
    }
    const medicalErrors = validateOnboardingMedicalExtras(merged);
    if (medicalErrors.length > 0) {
      return NextResponse.json({ error: medicalErrors[0] }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    application_id: validation.applicationId,
    token_id: validation.tokenId,
    form_data: merged,
  };

  if (step === "personal") updates.personal_completed_at = now;
  if (step === "medical") updates.medical_completed_at = now;
  if (step === "medical" && finalize) {
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
