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

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const applicationId = req.nextUrl.searchParams.get("application_id");
  const gradeOverride = req.nextUrl.searchParams.get("grade_level");

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

    const gradeLevel =
      gradeOverride?.trim().toUpperCase() ||
      hr.grade_level?.trim().toUpperCase() ||
      inferGradeLevel(app.role_slug, hr);

    const { companyIds, companyEmails } = await collectExistingEmployeeIds(supabaseAdmin);

    const excludeCurrentId = hr.employee_id?.trim();
    const excludeCurrentEmail = hr.company_email?.trim().toLowerCase();
    const idsForSuggestion = companyIds.filter((id) => id !== excludeCurrentId);
    const emailsForSuggestion = companyEmails.filter((e) => e !== excludeCurrentEmail);

    const employee_id = suggestEmployeeId(gradeLevel, idsForSuggestion);
    const company_email = suggestCompanyEmail({
      firstName,
      middleNames,
      lastName,
      existingEmails: emailsForSuggestion,
    });

    return NextResponse.json({
      success: true,
      data: {
        grade_level: gradeLevel ?? null,
        employee_id,
        company_email,
      },
    });
  } catch (err) {
    console.error("[GET /api/careers/onboarding/suggest-hr-fields]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
