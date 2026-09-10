import type { SupabaseClient } from "@supabase/supabase-js";
import type { OnboardingFormData, OnboardingHrData } from "@/lib/careers/onboardingTypes";

export type EmployeeOnboardingRecord = {
  application_id: string;
  submitted_at: string | null;
  form_data: OnboardingFormData;
  hr_data: OnboardingHrData;
  application: {
    reference_number: string;
    full_name: string;
    email: string;
    phone: string | null;
    role_title: string;
    application_form_data: Record<string, unknown> | null;
  };
};

async function findApplicationIdForUser(
  supabase: SupabaseClient,
  user: {
    application_id?: string | null;
    email: string;
    company_id: string;
  },
): Promise<string | null> {
  if (user.application_id) return user.application_id;

  const { data: onboardingRows } = await supabase
    .from("onboarding_submissions")
    .select("application_id, hr_data");

  for (const row of onboardingRows ?? []) {
    const hr = (row.hr_data ?? {}) as OnboardingHrData;
    const emailMatch =
      hr.company_email?.trim().toLowerCase() === user.email.trim().toLowerCase();
    const idMatch =
      hr.employee_id?.trim().toUpperCase() === user.company_id.trim().toUpperCase();
    if (emailMatch || idMatch) {
      return row.application_id as string;
    }
  }

  return null;
}

export async function fetchEmployeeOnboardingRecord(
  supabase: SupabaseClient,
  user: {
    application_id?: string | null;
    email: string;
    company_id: string;
  },
): Promise<EmployeeOnboardingRecord | null> {
  const applicationId = await findApplicationIdForUser(supabase, user);
  if (!applicationId) return null;

  const { data: row, error } = await supabase
    .from("onboarding_submissions")
    .select(
      `
      application_id,
      submitted_at,
      form_data,
      hr_data,
      job_applications (
        reference_number,
        full_name,
        email,
        phone,
        role_title,
        application_form_data
      )
    `,
    )
    .eq("application_id", applicationId)
    .maybeSingle();

  if (error || !row) return null;

  const rawApp = row.job_applications as
    | EmployeeOnboardingRecord["application"]
    | EmployeeOnboardingRecord["application"][]
    | null;
  const app = Array.isArray(rawApp) ? rawApp[0] : rawApp;
  if (!app) return null;

  return {
    application_id: row.application_id as string,
    submitted_at: (row.submitted_at as string | null) ?? null,
    form_data: (row.form_data ?? {}) as OnboardingFormData,
    hr_data: (row.hr_data ?? {}) as OnboardingHrData,
    application: {
      reference_number: app.reference_number,
      full_name: app.full_name,
      email: app.email,
      phone: app.phone ?? null,
      role_title: app.role_title,
      application_form_data: app.application_form_data ?? null,
    },
  };
}
