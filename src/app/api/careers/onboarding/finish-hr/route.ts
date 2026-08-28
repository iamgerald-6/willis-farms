import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { fetchGradeLevelsConfig } from "@/lib/grades/fetchGradeLevelsConfig";
import { resolveCompanyEmailDomain } from "@/lib/systemDefinitions/companyEmailDomain";
import { fetchModuleConfig } from "@/lib/systemDefinitions/getModuleConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";
import {
  buildOnboardingInvitePrefill,
  findExistingPlatformUserForApplication,
} from "@/lib/careers/buildOnboardingInvitePrefill";
import { collectExistingEmployeeIds } from "@/lib/careers/hrEmployeeDefaults";
import { invitePlatformEmployee } from "@/lib/careers/invitePlatformEmployee";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import type { OnboardingFormData } from "@/lib/careers/onboardingTypes";

/**
 * HR completes Section O after the candidate submits onboarding:
 * saves HR fields, sends the WillsOne platform invite (probation), and
 * links the user so they appear on the Employees tab.
 */
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireUserManagementAccess(req, "add");
  if (!caller) {
    return jsonForbidden(
      "Forbidden — User Management add access required to finish onboarding and invite to WillsOne.",
    );
  }

  const {
    application_id,
    hr_data,
  }: { application_id?: string; hr_data?: OnboardingHrData } = await req.json();

  if (!application_id) {
    return NextResponse.json(
      { error: "application_id is required." },
      { status: 400 },
    );
  }

  const { data: submission, error: submissionError } = await supabaseAdmin
    .from("onboarding_submissions")
    .select(
      `
      application_id,
      form_data,
      hr_data,
      submitted_at,
      job_applications (
        full_name,
        email,
        phone,
        role_title,
        role_slug,
        reference_number,
        status
      )
    `,
    )
    .eq("application_id", application_id)
    .maybeSingle();

  if (submissionError || !submission) {
    return NextResponse.json(
      { error: "Onboarding record not found." },
      { status: 404 },
    );
  }

  if (!submission.submitted_at) {
    return NextResponse.json(
      { error: "Candidate has not submitted onboarding yet." },
      { status: 400 },
    );
  }

  const rawApp = submission.job_applications;
  const app = (Array.isArray(rawApp) ? rawApp[0] : rawApp) as {
    full_name: string;
    email: string;
    phone: string;
    role_title: string;
    role_slug: string;
    reference_number: string;
    status: string;
  } | null;

  if (!app?.full_name) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const mergedHr: OnboardingHrData = {
    ...((submission.hr_data ?? {}) as OnboardingHrData),
    ...(hr_data ?? {}),
  };

  const { error: saveError } = await supabaseAdmin
    .from("onboarding_submissions")
    .update({ hr_data: mergedHr })
    .eq("application_id", application_id);

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  const gradeConfig = await fetchGradeLevelsConfig(supabaseAdmin);
  const moduleConfig = await fetchModuleConfig(supabaseAdmin, RECRUITMENT_MODULE_ID);
  const emailDomain = resolveCompanyEmailDomain(moduleConfig.businessLogic);
  const { companyEmails } = await collectExistingEmployeeIds(supabaseAdmin);
  const { data: existingUsers, error: usersError } = await supabaseAdmin
    .from("users")
    .select("user_id, email, first_name, last_name, grade_level, role");

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const prefill = buildOnboardingInvitePrefill({
    app,
    form_data: submission.form_data as OnboardingFormData,
    hr_data: mergedHr,
    existingUsers: existingUsers ?? [],
    existingEmails: companyEmails,
    gradeConfig,
    emailDomain,
  });

  if (!prefill) {
    return NextResponse.json(
      {
        error:
          "Complete Section O first — employee ID, company email, and candidate name are required.",
      },
      { status: 400 },
    );
  }

  const existingUser = await findExistingPlatformUserForApplication(
    supabaseAdmin,
    application_id,
    prefill.email,
  );

  if (existingUser) {
    return NextResponse.json(
      {
        error: "This candidate is already invited to WillsOne. Check the Employees tab.",
        data: { user_id: existingUser.user_id, already_invited: true },
      },
      { status: 409 },
    );
  }

  const inviteResult = await invitePlatformEmployee(supabaseAdmin, {
    email: prefill.email,
    invite_delivery_email: prefill.delivery_email,
    role: "employee",
    phone: prefill.phone || null,
    first_name: prefill.first_name,
    last_name: prefill.last_name,
    company_id: prefill.company_id,
    job_position: prefill.job_position || null,
    grade_level: prefill.grade_level ?? null,
    supervisor_id: prefill.supervisor_id ?? null,
    application_id,
    created_by: caller.id,
  });

  if (!inviteResult.ok) {
    return NextResponse.json(
      { error: inviteResult.error },
      { status: inviteResult.status ?? 500 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      user_id: inviteResult.user.user_id,
      employment_status: "probation",
      email: prefill.email,
      delivery_email: prefill.delivery_email,
      company_id: prefill.company_id,
    },
  });
}
