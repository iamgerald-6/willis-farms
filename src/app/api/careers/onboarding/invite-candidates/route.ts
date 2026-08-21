import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import {
  inferGradeLevel,
  suggestCompanyEmail,
  suggestEmployeeId,
  collectExistingEmployeeIds,
} from "@/lib/careers/hrEmployeeDefaults";
import {
  mergeOnboardingForm,
  parseApplicantName,
  type OnboardingFormData,
  type OnboardingHrData,
} from "@/lib/careers/onboardingTypes";

export type OnboardedInviteCandidate = {
  application_id: string;
  full_name: string;
  reference_number: string;
  prefill: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    job_position: string;
    grade_level?: string;
    company_id?: string;
  };
  /** Field keys populated from onboarding — HR should not retype these */
  locked_fields: (
    | "first_name"
    | "last_name"
    | "phone"
    | "job_position"
    | "grade_level"
    | "company_id"
  )[];
};

/** Completed onboarding submissions not yet invited as WillsOne users */
export async function GET(req: NextRequest) {
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
      "Forbidden — User Management add or edit access required.",
    );
  }

  try {
    const { data: existingUsers, error: usersError } = await supabaseAdmin
      .from("users")
      .select("email");

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const { companyIds, companyEmails: existingCompanyEmails } =
      await collectExistingEmployeeIds(supabaseAdmin);

    const assignedIdsThisBatch = new Set<string>();

    const invitedEmails = new Set(
      (existingUsers ?? [])
        .map((u) => u.email?.trim().toLowerCase())
        .filter(Boolean),
    );

    const { data: rows, error } = await supabaseAdmin
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
          reference_number
        )
      `,
      )
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const candidates: OnboardedInviteCandidate[] = [];

    for (const row of rows ?? []) {
      const rawApp = row.job_applications;
      const app = (Array.isArray(rawApp) ? rawApp[0] : rawApp) as {
        full_name: string;
        email: string;
        phone: string;
        role_title: string;
        role_slug: string;
        reference_number: string;
      } | null;

      if (!app?.full_name) continue;

      const form = mergeOnboardingForm(row.form_data as OnboardingFormData);
      const hr = (row.hr_data ?? {}) as OnboardingHrData;
      const parsed = parseApplicantName(app.full_name);

      const first_name =
        form.personal?.first_name?.trim() || parsed.first_name;
      const last_name = form.personal?.surname?.trim() || parsed.surname;
      const middle_names =
        form.personal?.middle_names?.trim() || parsed.middle_names;
      const phone = form.personal?.mobile?.trim() || app.phone?.trim() || "";
      const job_position =
        form.employment?.position_title?.trim() ||
        app.role_title?.trim() ||
        "";
      const grade_level = inferGradeLevel(app.role_slug, hr);

      // Prefer values HR saved on the onboarding record (Section O).
      let company_id = hr.employee_id?.trim() || undefined;
      if (!company_id && grade_level) {
        const idsPool = [...companyIds, ...assignedIdsThisBatch];
        company_id = suggestEmployeeId(grade_level, idsPool) ?? undefined;
        if (company_id) assignedIdsThisBatch.add(company_id);
      }

      const inviteEmail =
        hr.company_email?.trim().toLowerCase() ||
        suggestCompanyEmail({
          firstName: first_name,
          middleNames: middle_names,
          lastName: last_name,
          existingEmails: existingCompanyEmails,
        });

      if (!inviteEmail) continue;

      if (invitedEmails.has(inviteEmail)) continue;

      const locked_fields: OnboardedInviteCandidate["locked_fields"] = [];
      if (first_name) locked_fields.push("first_name");
      if (last_name) locked_fields.push("last_name");
      if (phone) locked_fields.push("phone");
      if (job_position) locked_fields.push("job_position");
      if (grade_level) locked_fields.push("grade_level");
      if (company_id) locked_fields.push("company_id");

      candidates.push({
        application_id: row.application_id,
        full_name: app.full_name,
        reference_number: app.reference_number,
        prefill: {
          first_name,
          last_name,
          email: inviteEmail,
          phone,
          job_position,
          grade_level,
          company_id,
        },
        locked_fields,
      });
    }

    return NextResponse.json({ success: true, data: candidates });
  } catch (err) {
    console.error("[GET /api/careers/onboarding/invite-candidates]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
