import type { SupabaseClient } from "@supabase/supabase-js";
import {
  inferGradeLevel,
  suggestCompanyEmail,
} from "@/lib/careers/hrEmployeeDefaults";
import {
  mergeOnboardingForm,
  parseApplicantName,
  type OnboardingFormData,
  type OnboardingHrData,
} from "@/lib/careers/onboardingTypes";
import { fetchGradeLevelsConfig } from "@/lib/grades/fetchGradeLevelsConfig";
import {
  canAssignAsSupervisor,
  resolveSupervisorByName,
} from "@/lib/supervisorAssignment";
import type { User } from "@/types";

export type OnboardingInvitePrefill = {
  first_name: string;
  last_name: string;
  /** WillsOne login username — HR company email (Supabase auth + users.email). */
  email: string;
  /** Job application email — where the set-password invite is delivered. */
  delivery_email: string;
  phone: string;
  job_position: string;
  grade_level?: string;
  company_id: string;
  supervisor_id?: string;
};

/** Email from job application / onboarding (invite delivery, not login username). */
export function resolveApplicationDeliveryEmail(input: {
  application_email?: string | null;
  form_data?: OnboardingFormData | null;
}): string {
  const form = mergeOnboardingForm(input.form_data);
  const fromForm = form.personal?.personal_email?.trim().toLowerCase();
  const fromApp = input.application_email?.trim().toLowerCase();
  return fromForm || fromApp || "";
}

type ExistingUserRow = Pick<
  User,
  "user_id" | "email" | "first_name" | "last_name" | "grade_level" | "role"
>;

export function buildOnboardingInvitePrefill(input: {
  app: {
    full_name: string;
    email: string;
    phone: string;
    role_title: string;
    role_slug: string;
  };
  form_data: OnboardingFormData | null | undefined;
  hr_data: OnboardingHrData | null | undefined;
  existingUsers: ExistingUserRow[];
  /** Taken emails from users + pending onboarding (see collectExistingEmployeeIds). */
  existingEmails?: string[];
  gradeConfig: Awaited<ReturnType<typeof fetchGradeLevelsConfig>>;
  emailDomain?: string;
}): OnboardingInvitePrefill | null {
  const form = mergeOnboardingForm(input.form_data);
  const hr = input.hr_data ?? {};
  const parsed = parseApplicantName(input.app.full_name);

  const first_name = form.personal?.first_name?.trim() || parsed.first_name;
  const last_name = form.personal?.surname?.trim() || parsed.surname;
  const middle_names = form.personal?.middle_names?.trim() || parsed.middle_names;
  const phone = form.personal?.mobile?.trim() || input.app.phone?.trim() || "";
  const job_position =
    hr.position_title?.trim() || input.app.role_title?.trim() || "";
  const grade_level = inferGradeLevel(input.app.role_slug, hr);
  const company_id = hr.employee_id?.trim();

  const takenEmails = new Set<string>();
  for (const user of input.existingUsers) {
    const email = user.email?.trim().toLowerCase();
    if (email) takenEmails.add(email);
  }
  for (const email of input.existingEmails ?? []) {
    const normalized = email.trim().toLowerCase();
    if (normalized) takenEmails.add(normalized);
  }

  const loginEmail =
    hr.company_email?.trim().toLowerCase() ||
    suggestCompanyEmail({
      firstName: first_name,
      middleNames: middle_names,
      lastName: last_name,
      existingEmails: [...takenEmails],
      domain: input.emailDomain,
    });

  const deliveryEmail = resolveApplicationDeliveryEmail({
    application_email: input.app.email,
    form_data: input.form_data,
  });

  if (!first_name || !last_name || !company_id || !loginEmail || !deliveryEmail) {
    return null;
  }

  const employeeStub = {
    user_id: "pending",
    role: "employee" as const,
    grade_level: grade_level ?? null,
  };

  let supervisor_id: string | undefined;

  if (hr.supervisor_id) {
    const picked = input.existingUsers.find((u) => u.user_id === hr.supervisor_id);
    if (picked && canAssignAsSupervisor(picked, employeeStub, input.gradeConfig)) {
      supervisor_id = picked.user_id;
    }
  }

  if (!supervisor_id && hr.supervisor_name) {
    const matchedSupervisor = resolveSupervisorByName(
      hr.supervisor_name,
      input.existingUsers,
    );
    const matchedSupervisorRow = matchedSupervisor
      ? input.existingUsers.find((u) => u.user_id === matchedSupervisor.user_id)
      : null;
    if (
      matchedSupervisorRow &&
      canAssignAsSupervisor(matchedSupervisorRow, employeeStub, input.gradeConfig)
    ) {
      supervisor_id = matchedSupervisorRow.user_id;
    }
  }

  return {
    first_name,
    last_name,
    email: loginEmail,
    delivery_email: deliveryEmail,
    phone,
    job_position,
    grade_level: grade_level ?? undefined,
    company_id,
    supervisor_id,
  };
}

export async function findExistingPlatformUserForApplication(
  supabaseAdmin: SupabaseClient,
  applicationId: string,
  inviteEmail?: string,
): Promise<{ user_id: string } | null> {
  const { data: byApp } = await supabaseAdmin
    .from("users")
    .select("user_id")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (byApp?.user_id) return byApp;

  if (inviteEmail) {
    const { data: byEmail } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("email", inviteEmail.trim().toLowerCase())
      .maybeSingle();
    if (byEmail?.user_id) return byEmail;
  }

  return null;
}
