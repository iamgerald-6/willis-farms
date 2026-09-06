import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  collectExistingEmployeeIds,
  inferGradeLevel,
  suggestCompanyEmail,
  suggestEmployeeId,
} from "@/lib/careers/hrEmployeeDefaults";
import {
  mergeOnboardingForm,
  parseApplicantName,
  type OnboardingFormData,
  type OnboardingHrData,
} from "@/lib/careers/onboardingTypes";
import { fetchModuleConfig } from "@/lib/systemDefinitions/getModuleConfig";
import { resolveCompanyEmailDomain } from "@/lib/systemDefinitions/companyEmailDomain";
import { resolveSalaryForGradeTier } from "@/lib/systemDefinitions/salaryRanges";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";
import { resolveOfferTermsFromPosting } from "@/lib/careers/resolveOfferTermsFromPosting";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const applicationId = req.nextUrl.searchParams.get("application_id");
  const gradeOverride = req.nextUrl.searchParams.get("grade_level");
  const salaryTierOverride = req.nextUrl.searchParams.get("salary_tier");

  if (!applicationId) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  try {
    // No onboarding_submissions row exists until HR first saves offer terms
    // (or the candidate later starts onboarding) — that includes the very
    // first time this panel is opened, which is exactly when the
    // posting-sourced suggestions are needed most. So a missing row here
    // falls back to the linked application directly instead of 404ing,
    // matching how /careers/onboarding/offer-letter already behaves.
    const { data: row, error } = await supabaseAdmin
      .from("onboarding_submissions")
      .select(
        `
        hr_data,
        form_data,
        job_applications (
          full_name,
          role_slug,
          job_posting_id
        )
      `,
      )
      .eq("application_id", applicationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type AppInfo = {
      full_name: string;
      role_slug: string;
      job_posting_id: string | null;
    };
    let app: AppInfo | null = null;

    if (row) {
      const rawApp = row.job_applications;
      app = (Array.isArray(rawApp) ? rawApp[0] : rawApp) as AppInfo | null;
    } else {
      const { data: directApp } = await supabaseAdmin
        .from("job_applications")
        .select("full_name, role_slug, job_posting_id")
        .eq("id", applicationId)
        .maybeSingle();
      app = directApp;
    }

    if (!app?.full_name) {
      return NextResponse.json({ error: "Linked application not found." }, { status: 404 });
    }

    const hr = (row?.hr_data ?? {}) as OnboardingHrData;
    const form = mergeOnboardingForm((row?.form_data ?? {}) as OnboardingFormData);
    const parsed = parseApplicantName(app.full_name);

    const firstName = form.personal?.first_name?.trim() || parsed.first_name;
    const middleNames = form.personal?.middle_names?.trim() || parsed.middle_names;
    const lastName = form.personal?.surname?.trim() || parsed.surname;

    const moduleConfig = await fetchModuleConfig(supabaseAdmin, RECRUITMENT_MODULE_ID);
    const gradeConfig = moduleConfig.businessLogic.gradeLevelsConfig;
    const emailDomain = resolveCompanyEmailDomain(moduleConfig.businessLogic);

    // The linked job posting is now the source of truth for role/pay
    // placement — see resolveOfferTermsFromPosting. Falls back to the
    // older role-slug-based inference only for an application whose
    // posting predates these fields (or has none linked at all).
    const postingTerms = await resolveOfferTermsFromPosting(supabaseAdmin, app.job_posting_id);

    const gradeLevel =
      postingTerms?.grade_level?.trim().toUpperCase() ||
      gradeOverride?.trim().toUpperCase() ||
      hr.grade_level?.trim().toUpperCase() ||
      inferGradeLevel(app.role_slug, hr, gradeConfig);

    const { companyIds, companyEmails } = await collectExistingEmployeeIds(supabaseAdmin);

    const excludeCurrentId = hr.employee_id?.trim();
    const excludeCurrentEmail = hr.company_email?.trim().toLowerCase();
    const idsForSuggestion = companyIds.filter((id) => id !== excludeCurrentId);
    const emailsForSuggestion = companyEmails.filter((e) => e !== excludeCurrentEmail);

    const employee_id = suggestEmployeeId(idsForSuggestion);
    const company_email = suggestCompanyEmail({
      firstName,
      middleNames,
      lastName,
      existingEmails: emailsForSuggestion,
      domain: emailDomain,
    });

    // Same priority as grade level: the posting's own Salary field wins
    // over the old grade-level pay-tier table.
    const salaryTier =
      salaryTierOverride?.trim().toLowerCase() ||
      hr.salary_tier?.trim().toLowerCase() ||
      "mid";
    const legacySalary = resolveSalaryForGradeTier(gradeLevel, salaryTier, gradeConfig);
    const salaryTierOut = postingTerms?.salary_tier ?? legacySalary.tier ?? salaryTier;
    const salaryRangeOut = postingTerms?.salary_range ?? legacySalary.formatted ?? null;
    const salaryGhsOut = hr.salary_ghs?.trim() || legacySalary.salaryGhs || null;

    return NextResponse.json({
      success: true,
      data: {
        grade_level: gradeLevel ?? null,
        employee_id,
        company_email,
        company_email_domain: emailDomain,
        salary_tier: salaryTierOut,
        salary_range: salaryRangeOut,
        salary_ghs: salaryGhsOut,
        salary_band_min: postingTerms?.salary_band_min ?? null,
        salary_band_max: postingTerms?.salary_band_max ?? null,
        position_title: postingTerms?.position_title ?? null,
        employment_type: postingTerms?.employment_type ?? null,
        department: postingTerms?.department ?? null,
        work_location: postingTerms?.work_location ?? null,
      },
    });
  } catch (err) {
    console.error("[GET /api/careers/onboarding/suggest-hr-fields]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
