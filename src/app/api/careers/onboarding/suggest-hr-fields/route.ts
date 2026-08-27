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
    const { data: row, error } = await supabaseAdmin
      .from("onboarding_submissions")
      .select(
        `
        hr_data,
        form_data,
        job_applications (
          full_name,
          role_slug
        )
      `,
      )
      .eq("application_id", applicationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Onboarding record not found." }, { status: 404 });
    }

    const rawApp = row.job_applications;
    const app = (Array.isArray(rawApp) ? rawApp[0] : rawApp) as {
      full_name: string;
      role_slug: string;
    } | null;

    if (!app?.full_name) {
      return NextResponse.json({ error: "Linked application not found." }, { status: 404 });
    }

    const hr = (row.hr_data ?? {}) as OnboardingHrData;
    const form = mergeOnboardingForm(row.form_data as OnboardingFormData);
    const parsed = parseApplicantName(app.full_name);

    const firstName = form.personal?.first_name?.trim() || parsed.first_name;
    const middleNames = form.personal?.middle_names?.trim() || parsed.middle_names;
    const lastName = form.personal?.surname?.trim() || parsed.surname;

    const moduleConfig = await fetchModuleConfig(supabaseAdmin, RECRUITMENT_MODULE_ID);
    const gradeConfig = moduleConfig.businessLogic.gradeLevelsConfig;
    const emailDomain = resolveCompanyEmailDomain(moduleConfig.businessLogic);

    const gradeLevel =
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

    const salaryTier =
      salaryTierOverride?.trim().toLowerCase() ||
      hr.salary_tier?.trim().toLowerCase() ||
      "mid";
    const salary = resolveSalaryForGradeTier(
      gradeLevel,
      salaryTier,
      gradeConfig,
    );

    return NextResponse.json({
      success: true,
      data: {
        grade_level: gradeLevel ?? null,
        employee_id,
        company_email,
        company_email_domain: emailDomain,
        salary_tier: salary.tier ?? salaryTier,
        salary_range: salary.formatted || null,
        salary_ghs: salary.salaryGhs || null,
      },
    });
  } catch (err) {
    console.error("[GET /api/careers/onboarding/suggest-hr-fields]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
