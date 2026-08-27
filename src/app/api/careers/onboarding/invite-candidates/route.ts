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
  suggestEmployeeId,
  collectExistingEmployeeIds,
} from "@/lib/careers/hrEmployeeDefaults";
import { buildOnboardingInvitePrefill } from "@/lib/careers/buildOnboardingInvitePrefill";
import type { OnboardingFormData, OnboardingHrData } from "@/lib/careers/onboardingTypes";

export type OnboardedInviteCandidate = {
  application_id: string;
  full_name: string;
  reference_number: string;
  prefill: {
    first_name: string;
    last_name: string;
    /** WillsOne login username (HR company email). */
    email: string;
    /** Job application email — invite is sent here. */
    delivery_email: string;
    phone: string;
    job_position: string;
    grade_level?: string;
    company_id?: string;
    supervisor_id?: string;
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
    const gradeConfig = await fetchGradeLevelsConfig(supabaseAdmin);
    const moduleConfig = await fetchModuleConfig(supabaseAdmin, RECRUITMENT_MODULE_ID);
    const emailDomain = resolveCompanyEmailDomain(moduleConfig.businessLogic);

    const { data: existingUsers, error: usersError } = await supabaseAdmin
      .from("users")
      .select("user_id, email, first_name, last_name, grade_level, role");

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const { companyIds, companyEmails } = await collectExistingEmployeeIds(supabaseAdmin);

    const assignedIdsThisBatch = new Set<string>();

    const invitedEmails = new Set(companyEmails);

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

      const hr = (row.hr_data ?? {}) as OnboardingHrData;

      let company_id = hr.employee_id?.trim() || undefined;
      if (!company_id) {
        const idsPool = [...companyIds, ...assignedIdsThisBatch];
        company_id = suggestEmployeeId(idsPool);
        assignedIdsThisBatch.add(company_id);
      }

      const prefill = buildOnboardingInvitePrefill({
        app,
        form_data: row.form_data as OnboardingFormData,
        hr_data: { ...hr, employee_id: company_id } as OnboardingHrData,
        existingUsers: existingUsers ?? [],
        existingEmails: [...invitedEmails],
        gradeConfig,
        emailDomain,
      });

      if (!prefill) continue;

      if (invitedEmails.has(prefill.email)) continue;
      invitedEmails.add(prefill.email);

      const locked_fields: OnboardedInviteCandidate["locked_fields"] = [];
      if (prefill.first_name) locked_fields.push("first_name");
      if (prefill.last_name) locked_fields.push("last_name");
      if (prefill.phone) locked_fields.push("phone");
      if (prefill.job_position) locked_fields.push("job_position");
      if (prefill.grade_level) locked_fields.push("grade_level");
      if (prefill.company_id) locked_fields.push("company_id");

      candidates.push({
        application_id: row.application_id,
        full_name: app.full_name,
        reference_number: app.reference_number,
        prefill: {
          first_name: prefill.first_name,
          last_name: prefill.last_name,
          email: prefill.email,
          delivery_email: prefill.delivery_email,
          phone: prefill.phone,
          job_position: prefill.job_position,
          grade_level: prefill.grade_level,
          company_id: prefill.company_id,
          supervisor_id: prefill.supervisor_id,
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
