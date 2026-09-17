import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireRecruitmentAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import { fetchActiveMedicalFormSchema } from "@/lib/medical/medicalTemplates";
import { buildMedicalReferralData } from "@/lib/medical/medicalReferral";
import { buildInitialMedicalResponses } from "@/lib/medical/medicalResponses";
import type { OnboardingFormData, OnboardingHrData } from "@/lib/careers/onboardingTypes";

/** POST — reset a submitted examination to draft with latest template (after resend). */
export async function POST(req: NextRequest) {
  const caller = await requireRecruitmentAccess(req, "edit");
  if (!caller) return jsonForbidden("Recruitment edit access is required.");

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { application_id } = (await req.json()) as { application_id?: string };
  if (!application_id) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  const active = await fetchActiveMedicalFormSchema(supabaseAdmin);
  if (!active) {
    return NextResponse.json({ error: "No published medical form template." }, { status: 400 });
  }

  const { data: application } = await supabaseAdmin
    .from("job_applications")
    .select("*")
    .eq("id", application_id)
    .maybeSingle();

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  // Archive whatever the hospital already filled in before this row gets
  // reset to a fresh draft below — otherwise it's overwritten and lost for
  // good (medical_examinations is one row per candidate). Only worth
  // keeping if the previous cycle actually went somewhere (sent or
  // submitted) — a never-sent blank draft has nothing to preserve.
  const { data: existingExam } = await supabaseAdmin
    .from("medical_examinations")
    .select("*")
    .eq("application_id", application_id)
    .maybeSingle();

  if (existingExam && (existingExam.status === "submitted" || existingExam.link_sent_at)) {
    const { error: archiveError } = await supabaseAdmin.from("medical_examination_history").insert({
      application_id,
      examination_id: existingExam.id,
      template_version_id: existingExam.template_version_id,
      form_schema: existingExam.form_schema,
      referral_data: existingExam.referral_data,
      form_responses: existingExam.form_responses,
      status: existingExam.status,
      hospital_email: existingExam.hospital_email,
      link_sent_at: existingExam.link_sent_at,
      submitted_at: existingExam.submitted_at,
    });
    if (archiveError) {
      // Don't proceed with the reset if we couldn't preserve the previous
      // cycle first — losing a hospital's submitted results silently is
      // worse than blocking the resend.
      return NextResponse.json(
        { error: `Could not archive the previous submission: ${archiveError.message}` },
        { status: 500 },
      );
    }
  }

  const { data: submission } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("form_data, hr_data")
    .eq("application_id", application_id)
    .maybeSingle();

  const referral = buildMedicalReferralData({
    application,
    formData: (submission?.form_data ?? {}) as OnboardingFormData,
    hrData: (submission?.hr_data ?? {}) as OnboardingHrData,
    issuedByName: caller.name,
  });

  const now = new Date().toISOString();
  const initialResponses = buildInitialMedicalResponses(active.schema);

  const { data: exam, error } = await supabaseAdmin
    .from("medical_examinations")
    .upsert(
      {
        application_id,
        template_version_id: active.version.id,
        form_schema: active.schema,
        referral_data: referral,
        form_responses: initialResponses,
        status: "draft",
        submitted_at: null,
        link_sent_at: null,
        updated_at: now,
      },
      { onConflict: "application_id" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { examination: exam } });
}
