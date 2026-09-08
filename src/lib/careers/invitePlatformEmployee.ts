import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppBaseUrl } from "@/lib/appUrl";
import { buildInviteEmail, sendViaResend } from "@/lib/email/resendClient";
import { isSuperAdmin } from "@/lib/accessControl";
import { fetchGradeLevelsConfig } from "@/lib/grades/fetchGradeLevelsConfig";
import { resolveAllGradeLevels } from "@/lib/systemDefinitions/gradeLevelsConfig";
import { canAssignAsSupervisor } from "@/lib/supervisorAssignment";
import { resolveUserRoleLabelById } from "@/lib/userRoleAccessControl";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";

export type InvitePlatformEmployeeInput = {
  /** Login username — stored on Supabase auth and users.email. */
  email: string;
  /** Where to send the set-password invite (defaults to email when omitted). */
  invite_delivery_email?: string | null;
  role: "admin" | "manager" | "employee";
  phone?: string | null;
  first_name: string;
  last_name: string;
  company_id: string;
  job_position?: string | null;
  grade_level?: string | null;
  supervisor_id?: string | null;
  application_id?: string | null;
  created_by?: string | null;
  /** Org placement carried over from the linked job posting, when known —
   * see resolveEmployeeOrgPlacementFromPosting. Null for any piece the
   * posting didn't have (or when there's no linked posting at all). */
  site_id?: string | null;
  business_unit_id?: string | null;
  department_id?: string | null;
  section_id?: string | null;
  position_id?: string | null;
  grade_level_id?: string | null;
  /** "User role" org-structure list — same placement mechanism as the org
   * fields above. */
  user_role_id?: string | null;
};

export type InvitePlatformEmployeeResult =
  | { ok: true; user: Record<string, unknown> }
  | { ok: false; error: string; status?: number };

export async function invitePlatformEmployee(
  supabaseAdmin: SupabaseClient,
  input: InvitePlatformEmployeeInput,
): Promise<InvitePlatformEmployeeResult> {
  const {
    email,
    invite_delivery_email,
    role,
    phone,
    first_name,
    last_name,
    company_id,
    job_position,
    grade_level,
    supervisor_id,
    application_id,
    created_by,
    site_id,
    business_unit_id,
    department_id,
    section_id,
    position_id,
    grade_level_id,
    user_role_id,
  } = input;

  if (!email || !role || !first_name || !last_name || !company_id) {
    return { ok: false, error: "Missing required fields.", status: 400 };
  }

  if (isSuperAdmin(role)) {
    return { ok: false, error: "Invalid role", status: 403 };
  }

  const validRoles = ["admin", "manager", "employee"];
  if (!validRoles.includes(role)) {
    return { ok: false, error: "Invalid role", status: 400 };
  }

  const gradeConfig = await fetchGradeLevelsConfig(supabaseAdmin);

  // grade_level (text, e.g. "L1") is no longer a users column — it only
  // ever arrives here as a fallback hint from the onboarding HR form
  // (see inferGradeLevel) when the linked job posting didn't already
  // supply grade_level_id via org placement. Resolve it against the real
  // Grade levels catalog to get the row's actual id, since that id — not
  // the text — is what gets written to users.grade_level_id below.
  const gradeLevelTrimmed = grade_level?.trim() ?? "";
  let resolvedGradeLevelId = grade_level_id ?? null;

  if (gradeLevelTrimmed) {
    const matchedGrade = resolveAllGradeLevels(gradeConfig).find(
      (level) => level.id.toLowerCase() === gradeLevelTrimmed.toLowerCase(),
    );
    if (!matchedGrade) {
      return {
        ok: false,
        error: `Invalid grade level "${gradeLevelTrimmed}".`,
        status: 400,
      };
    }
    if (!resolvedGradeLevelId) {
      const { data: gradeRow } = await supabaseAdmin
        .from("grade_levels")
        .select("id")
        .ilike("code", gradeLevelTrimmed)
        .maybeSingle();
      resolvedGradeLevelId = gradeRow?.id ?? null;
    }
  }

  let resolvedSupervisorId: string | null = null;

  if (supervisor_id) {
    const { data: supervisor, error: supervisorError } = await supabaseAdmin
      .from("users")
      .select("user_id, role, user_role_id")
      .eq("user_id", String(supervisor_id).trim())
      .maybeSingle();

    if (supervisorError || !supervisor) {
      return { ok: false, error: "Supervisor not found", status: 404 };
    }

    const employeeStub = { user_id: "pending" };

    const supervisorRoleLabel = await resolveUserRoleLabelById(
      supabaseAdmin,
      supervisor.user_role_id,
    );

    if (
      !canAssignAsSupervisor(
        { ...supervisor, user_role_label: supervisorRoleLabel },
        employeeStub,
        "onboarding",
      )
    ) {
      return {
        ok: false,
        error: "Invalid supervisor — must have the Supervisory Role User role.",
        status: 400,
      };
    }

    resolvedSupervisorId = supervisor.user_id;
  }

  const redirectTo = `${getAppBaseUrl()}/set-password`;

  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: { role },
      },
    });

  if (linkError) {
    return { ok: false, error: linkError.message, status: 400 };
  }

  const authUser = linkData.user;
  const actionLink = linkData.properties?.action_link;

  if (!authUser?.id || !actionLink) {
    return { ok: false, error: "Could not create invite link.", status: 500 };
  }

  const invitedAt = new Date().toISOString();

  const baseRow = {
    user_id: authUser.id,
    email,
    phone: phone ?? null,
    role,
    first_name,
    last_name,
    company_id,
    job_position: job_position ?? null,
    supervisor_id: resolvedSupervisorId,
    created_at: invitedAt,
    application_id: application_id ?? null,
    employment_status: role === "employee" ? "probation" : null,
    platform_invited_at: role === "employee" ? invitedAt : null,
    site_id: site_id ?? null,
    business_unit_id: business_unit_id ?? null,
    department_id: department_id ?? null,
    section_id: section_id ?? null,
    position_id: position_id ?? null,
    grade_level_id: resolvedGradeLevelId,
    user_role_id: user_role_id ?? null,
  };

  const insertAttempts: Record<string, unknown>[] = [
    {
      ...baseRow,
      created_by: created_by ?? undefined,
      email_verified: false,
      email_confirm: false,
    },
    { ...baseRow, email_verified: false, email_confirm: false },
    { ...baseRow },
    {
      ...baseRow,
      supervisor_id: undefined,
      created_by: created_by ?? undefined,
      email_verified: false,
      email_confirm: false,
    },
    {
      ...baseRow,
      supervisor_id: undefined,
      email_verified: false,
      email_confirm: false,
    },
    { ...baseRow, supervisor_id: undefined },
    {
      ...baseRow,
      application_id: undefined,
      employment_status: undefined,
      platform_invited_at: undefined,
    },
    {
      ...baseRow,
      site_id: undefined,
      business_unit_id: undefined,
      department_id: undefined,
      section_id: undefined,
      position_id: undefined,
      grade_level_id: undefined,
      user_role_id: undefined,
    },
    {
      ...baseRow,
      supervisor_id: undefined,
      application_id: undefined,
      employment_status: undefined,
      platform_invited_at: undefined,
      site_id: undefined,
      business_unit_id: undefined,
      department_id: undefined,
      section_id: undefined,
      position_id: undefined,
      grade_level_id: undefined,
      user_role_id: undefined,
    },
  ];

  let tableUser: Record<string, unknown> | null = null;
  let tableError: { message: string } | null = null;

  for (const row of insertAttempts) {
    const result = await supabaseAdmin
      .from("users")
      .insert([row])
      .select()
      .single();

    if (!result.error) {
      tableUser = result.data as Record<string, unknown>;
      tableError = null;
      break;
    }

    tableError = result.error;
    const msg = result.error.message.toLowerCase();
    const missingOptionalColumn =
      msg.includes("created_by") ||
      msg.includes("email_verified") ||
      msg.includes("email_confirm") ||
      msg.includes("supervisor_id") ||
      msg.includes("application_id") ||
      msg.includes("employment_status") ||
      msg.includes("platform_invited_at") ||
      msg.includes("site_id") ||
      msg.includes("business_unit_id") ||
      msg.includes("department_id") ||
      msg.includes("section_id") ||
      msg.includes("position_id") ||
      msg.includes("grade_level_id") ||
      msg.includes("user_role_id") ||
      msg.includes("schema cache");

    if (!missingOptionalColumn) break;
  }

  if (tableError || !tableUser) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    const msg = tableError?.message ?? "Could not create user.";
    const hint = tableError?.message?.includes("created_by")
      ? " Run in Supabase SQL: ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by uuid; NOTIFY pgrst, 'reload schema';"
      : "";
    return {
      ok: false,
      error: msg + hint,
      status: 400,
    };
  }

  if (application_id && role === "employee") {
    await syncOnboardingHrAfterPlatformInvite(supabaseAdmin, application_id, invitedAt);
  }

  const deliveryTo = invite_delivery_email?.trim().toLowerCase() || email.trim().toLowerCase();
  const mail = buildInviteEmail(actionLink, first_name, email.trim().toLowerCase());
  const sendResult = await sendViaResend({
    to: deliveryTo,
    ...mail,
  });

  if (!sendResult.sent) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    await supabaseAdmin.from("users").delete().eq("user_id", authUser.id);
    return {
      ok: false,
      error: sendResult.error ?? "Failed to send invite email.",
      status: 500,
    };
  }

  return { ok: true, user: tableUser };
}

export async function syncOnboardingHrAfterPlatformInvite(
  supabaseAdmin: SupabaseClient,
  applicationId: string,
  invitedAt: string,
  hrPatch?: Partial<OnboardingHrData>,
): Promise<void> {
  const { data: onboardingRow } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("hr_data")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (!onboardingRow) return;

  const hr = (onboardingRow.hr_data ?? {}) as OnboardingHrData;
  await supabaseAdmin
    .from("onboarding_submissions")
    .update({
      hr_data: {
        ...hr,
        ...hrPatch,
        platform_invited_at: invitedAt,
        employment_status: "probation",
        hr_finished_at: invitedAt,
      },
    })
    .eq("application_id", applicationId);
}
