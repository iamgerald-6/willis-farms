import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import type { JobApplication } from "@/lib/careers/types";
import { resolveOfferLetterContext } from "@/lib/careers/resolveOfferLetterContext";
import { validateOfferTerms } from "@/lib/careers/offerTerms";
import { fetchModuleConfig } from "@/lib/systemDefinitions/getModuleConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

type OfferLetterFile = {
  secure_url: string;
  public_id: string;
  original_name: string;
};

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const applicationId = req.nextUrl.searchParams.get("application_id");
  if (!applicationId) {
    return NextResponse.json(
      { error: "application_id is required." },
      { status: 400 },
    );
  }

  const { data: application } = await supabaseAdmin
    .from("job_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("hr_data")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hr = (data?.hr_data ?? {}) as OnboardingHrData;

  let context = null;
  let gradeConfig;
  if (application) {
    const moduleConfig = await fetchModuleConfig(supabaseAdmin, RECRUITMENT_MODULE_ID);
    gradeConfig = moduleConfig.businessLogic.gradeLevelsConfig;
    context = await resolveOfferLetterContext(
      supabaseAdmin,
      application as JobApplication,
      hr,
    );
  }

  const termsValidation = validateOfferTerms(hr, gradeConfig);

  return NextResponse.json({
    success: true,
    data: {
      offer_letter: hr.offer_letter ?? null,
      offer_letter_draft: hr.offer_letter_draft ?? null,
      offer_letter_generated_at: hr.offer_letter_generated_at ?? null,
      offer_letter_uploaded_at: hr.offer_letter_uploaded_at ?? null,
      offer_terms_saved_at: hr.offer_terms_saved_at ?? null,
      hr_data: hr,
      offer_terms_valid: termsValidation.valid,
      context: context
        ? {
            salary_ghs: context.salaryGhs ?? null,
            grade_level: context.gradeLevel ?? null,
            pay_frequency: context.payFrequency ?? null,
            salary_display: context.salaryDisplay ?? null,
            employment_type: context.employmentType ?? null,
            department: context.department ?? null,
            work_location: context.workLocation ?? null,
            position_title: context.roleTitle ?? null,
            medical_reports: context.medicalReports,
            recommended_start_date: context.recommendedStartDate ?? null,
            reporting_to: context.reportingTo ?? null,
            notice_period: context.noticePeriod ?? null,
            working_hours: context.workingHours ?? null,
            acceptance_deadline: context.acceptanceDeadline ?? null,
            basic_salary_ghs: context.basicSalaryGhs ?? null,
            housing_allowance: context.housingAllowance ?? null,
            medical_allowance: context.medicalAllowance ?? null,
            social_security_contribution: context.socialSecurityContribution ?? null,
            income_tax: context.incomeTax ?? null,
            net_payable: context.netPayable ?? null,
          }
        : null,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const body = await req.json();
  const {
    application_id,
    offer_letter,
    offer_letter_draft,
  }: {
    application_id?: string;
    offer_letter?: OfferLetterFile;
    offer_letter_draft?: string;
  } = body;

  if (!application_id) {
    return NextResponse.json(
      { error: "application_id is required." },
      { status: 400 },
    );
  }

  if (!offer_letter?.secure_url && offer_letter_draft === undefined) {
    return NextResponse.json(
      { error: "offer_letter or offer_letter_draft is required." },
      { status: 400 },
    );
  }

  const { data: application, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select("id, status")
    .eq("id", application_id)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (application.status !== "offer") {
    return NextResponse.json(
      { error: "Offer letter can only be updated while the applicant is on Offer." },
      { status: 400 },
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("hr_data, form_data")
    .eq("application_id", application_id)
    .maybeSingle();

  const hr = (existing?.hr_data ?? {}) as OnboardingHrData;
  const now = new Date().toISOString();

  const nextHr: OnboardingHrData = {
    ...hr,
    ...(offer_letter_draft !== undefined
      ? { offer_letter_draft: offer_letter_draft.trim() }
      : {}),
    ...(offer_letter?.secure_url
      ? {
          offer_letter,
          offer_letter_uploaded_at: now,
        }
      : {}),
  };

  const { data, error } = await supabaseAdmin
    .from("onboarding_submissions")
    .upsert(
      {
        application_id,
        form_data: existing?.form_data ?? {},
        hr_data: nextHr,
      },
      { onConflict: "application_id" },
    )
    .select("hr_data")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const saved = data.hr_data as OnboardingHrData;
  return NextResponse.json({
    success: true,
    data: {
      offer_letter: saved.offer_letter ?? null,
      offer_letter_draft: saved.offer_letter_draft ?? null,
    },
  });
}
