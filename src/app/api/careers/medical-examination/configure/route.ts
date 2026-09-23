import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireRecruitmentAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import type { OnboardingFormData, OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { buildMedicalReferralData } from "@/lib/medical/medicalReferral";
import {
  buildConfiguredMedicalFormSchema,
  buildMedicalFormConfig,
} from "@/lib/medical/buildConfiguredMedicalFormSchema";
import {
  type MedicalExamComponentId,
  medicalJobCategoryLetter,
} from "@/lib/medical/medicalExamRequirementsMatrix";
import { fetchActiveMedicalFormSchema } from "@/lib/medical/medicalTemplates";
import { buildInitialMedicalResponses } from "@/lib/medical/medicalResponses";
import type { MedicalExamination } from "@/lib/medical/medicalFormSchema";

export async function POST(req: NextRequest) {
  const caller = await requireRecruitmentAccess(req, "edit");
  if (!caller) return jsonForbidden("Recruitment edit access is required.");

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const body = (await req.json()) as {
    application_id?: string;
    hr_data?: OnboardingHrData;
    included_components?: MedicalExamComponentId[];
  };

  if (!body.application_id?.trim()) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  const jobCategory = body.hr_data?.medical_job_category?.trim();
  if (!jobCategory || !medicalJobCategoryLetter(jobCategory)) {
    return NextResponse.json({ error: "Select a valid job category first." }, { status: 400 });
  }

  if (!Array.isArray(body.included_components) || body.included_components.length === 0) {
    return NextResponse.json({ error: "Select at least one form component." }, { status: 400 });
  }

  const active = await fetchActiveMedicalFormSchema(supabaseAdmin);
  if (!active) {
    return NextResponse.json(
      {
        error:
          "No published medical form template. Configure one under System Definitions → Medical form.",
      },
      { status: 400 },
    );
  }

  const formConfig = buildMedicalFormConfig({
    jobCategory,
    includedComponents: body.included_components,
    configuredBy: caller.name ?? caller.email ?? undefined,
  });

  if (!formConfig) {
    return NextResponse.json({ error: "Could not build form configuration." }, { status: 400 });
  }

  const { data: application } = await supabaseAdmin
    .from("job_applications")
    .select("*")
    .eq("id", body.application_id)
    .maybeSingle();

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const { data: submission } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("form_data, hr_data")
    .eq("application_id", body.application_id)
    .maybeSingle();

  const formData = (submission?.form_data ?? {}) as OnboardingFormData;
  const hrData = { ...(submission?.hr_data as OnboardingHrData), ...(body.hr_data ?? {}) };

  const referral = buildMedicalReferralData({
    application,
    formData,
    hrData,
    issuedByName: caller.name,
    overrides: { form_config: formConfig },
  });

  const configuredSchema = buildConfiguredMedicalFormSchema(
    active.schema,
    formConfig.included_components,
  );
  const initialResponses = buildInitialMedicalResponses(configuredSchema);

  const now = new Date().toISOString();

  const { data: existingExam } = await supabaseAdmin
    .from("medical_examinations")
    .select("*")
    .eq("application_id", body.application_id)
    .maybeSingle();

  if (existingExam?.status === "submitted") {
    return NextResponse.json(
      { error: "Medical examination already submitted. Resend a new link to reconfigure." },
      { status: 400 },
    );
  }

  let examination: MedicalExamination;

  if (existingExam) {
    const { data: updated, error } = await supabaseAdmin
      .from("medical_examinations")
      .update({
        referral_data: referral,
        form_schema: configuredSchema,
        template_version_id: active.version.id,
        form_responses: initialResponses,
        updated_at: now,
      })
      .eq("id", existingExam.id)
      .select("*")
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: error?.message ?? "Failed to save configuration." }, { status: 500 });
    }
    examination = updated as MedicalExamination;
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("medical_examinations")
      .insert({
        application_id: body.application_id,
        template_version_id: active.version.id,
        form_schema: configuredSchema,
        referral_data: referral,
        form_responses: initialResponses,
        hospital_email: hrData.medical_hospital_email?.trim() || null,
        status: "draft",
      })
      .select("*")
      .single();

    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? "Failed to create examination." }, { status: 500 });
    }
    examination = created as MedicalExamination;
  }

  if (body.hr_data) {
    const mergedHr = { ...(submission?.hr_data as object), ...body.hr_data };
    await supabaseAdmin
      .from("onboarding_submissions")
      .update({ hr_data: mergedHr, updated_at: now })
      .eq("application_id", body.application_id);
  }

  return NextResponse.json({
    data: {
      examination,
      form_config: formConfig,
    },
  });
}
