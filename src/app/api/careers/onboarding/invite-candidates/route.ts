import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { getOpeningBySlug } from "@/lib/careers/openings";
import {
  mergeOnboardingForm,
  parseApplicantName,
  type OnboardingFormData,
  type OnboardingHrData,
} from "@/lib/careers/onboardingTypes";

const GRADE_LEVELS = new Set(["L1", "L2", "L3", "L4", "L5", "L6", "L7"]);

function inferGradeLevel(
  roleSlug: string,
  hrData: OnboardingHrData | null | undefined,
): string | undefined {
  const fromHr = hrData?.grade_level?.trim().toUpperCase();
  if (fromHr && GRADE_LEVELS.has(fromHr)) return fromHr;

  const opening = getOpeningBySlug(roleSlug);
  const key = opening?.interviewGuideKey?.toUpperCase();
  if (key && GRADE_LEVELS.has(key)) return key;

  return undefined;
}

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
    | "email"
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

      if (!app?.email) continue;

      const email = app.email.trim().toLowerCase();
      if (invitedEmails.has(email)) continue;

      const form = mergeOnboardingForm(row.form_data as OnboardingFormData);
      const hr = (row.hr_data ?? {}) as OnboardingHrData;
      const parsed = parseApplicantName(app.full_name);

      const first_name =
        form.personal?.first_name?.trim() || parsed.first_name;
      const last_name = form.personal?.surname?.trim() || parsed.surname;
      const phone = form.personal?.mobile?.trim() || app.phone?.trim() || "";
      const job_position =
        form.employment?.position_title?.trim() ||
        app.role_title?.trim() ||
        "";
      const grade_level = inferGradeLevel(app.role_slug, hr);
      const company_id = hr.employee_id?.trim() || undefined;

      const locked_fields: OnboardedInviteCandidate["locked_fields"] = [];
      if (first_name) locked_fields.push("first_name");
      if (last_name) locked_fields.push("last_name");
      if (email) locked_fields.push("email");
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
          email: app.email.trim().toLowerCase(),
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
