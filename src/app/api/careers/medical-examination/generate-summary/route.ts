import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireRecruitmentAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import type { OnboardingFormData, OnboardingHrData } from "@/lib/careers/onboardingTypes";
import type { MedicalExamination } from "@/lib/medical/medicalFormSchema";
import { generateMedicalExamIntelSummary } from "@/lib/medical/generateMedicalExamSummary";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const caller = await requireRecruitmentAccess(req, "edit");
  if (!caller) return jsonForbidden("Recruitment edit access is required.");

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const body = (await req.json()) as { application_id?: string; history_id?: string };
  if (!body.application_id?.trim()) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  const { data: application } = await supabaseAdmin
    .from("job_applications")
    .select("full_name, role_title")
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

  let rawSchema: unknown;
  let responses: MedicalExamination["form_responses"];
  let referral: MedicalExamination["referral_data"];

  if (body.history_id?.trim()) {
    const { data: entry } = await supabaseAdmin
      .from("medical_examination_history")
      .select("*")
      .eq("id", body.history_id.trim())
      .eq("application_id", body.application_id)
      .maybeSingle();

    if (!entry || entry.status !== "submitted") {
      return NextResponse.json({ error: "Submitted history entry not found." }, { status: 404 });
    }

    rawSchema = entry.form_schema;
    responses = entry.form_responses ?? {};
    referral = entry.referral_data ?? {};
  } else {
    const { data: exam } = await supabaseAdmin
      .from("medical_examinations")
      .select("*")
      .eq("application_id", body.application_id)
      .maybeSingle();

    if (!exam || (exam as MedicalExamination).status !== "submitted") {
      return NextResponse.json(
        { error: "Medical examination has not been submitted yet." },
        { status: 400 },
      );
    }

    const examination = exam as MedicalExamination;
    rawSchema = examination.form_schema;
    responses = examination.form_responses ?? {};
    referral = examination.referral_data ?? {};
  }

  const result = await generateMedicalExamIntelSummary({
    rawSchema,
    responses,
    referral,
    formData,
    candidateName: application.full_name,
    roleTitle: application.role_title,
  });

  const hr = (submission?.hr_data ?? {}) as OnboardingHrData;
  const now = new Date().toISOString();

  await supabaseAdmin.from("onboarding_submissions").upsert(
    {
      application_id: body.application_id,
      form_data: submission?.form_data ?? {},
      hr_data: {
        ...hr,
        medical_exam_intel_summary: result.formatted,
        medical_exam_intel_summary_generated_at: now,
      },
    },
    { onConflict: "application_id" },
  );

  return NextResponse.json({
    data: {
      summary: result.formatted,
      summary_structured: result.summary,
      generated_by: result.generated_by,
      generated_at: now,
    },
  });
}
