import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMergedCandidateProfile,
  type ProfileReviewGroup,
} from "@/lib/careers/buildMergedCandidateProfile";
import type { OnboardingFormData } from "@/lib/careers/onboardingTypes";

export type EmployeeProfileExportHeader = {
  fullName: string;
  roleTitle?: string;
  referenceNumber?: string;
  submittedAt?: string | null;
  email?: string;
  phone?: string;
};

export type EmployeeProfileExportData = {
  header: EmployeeProfileExportHeader;
  groups: ProfileReviewGroup[];
};

export async function loadEmployeeProfileExportData(
  supabaseAdmin: SupabaseClient,
  applicationId: string,
): Promise<EmployeeProfileExportData | null> {
  const { data: application, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select(
      "id, full_name, email, phone, role_title, reference_number, application_form_data",
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (appError || !application) return null;

  const { data: submission } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("form_data, submitted_at")
    .eq("application_id", applicationId)
    .maybeSingle();

  const groups = buildMergedCandidateProfile({
    applicationFormData: application.application_form_data as Record<
      string,
      unknown
    > | null,
    onboardingFormData: (submission?.form_data ?? {}) as OnboardingFormData,
  });

  if (groups.length === 0) return null;

  return {
    header: {
      fullName: application.full_name,
      roleTitle: application.role_title ?? undefined,
      referenceNumber: application.reference_number ?? undefined,
      submittedAt: submission?.submitted_at ?? null,
      email: application.email ?? undefined,
      phone: application.phone ?? undefined,
    },
    groups,
  };
}

export function employeeProfilePdfFileName(fullName: string): string {
  const slug = fullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");
  return `employee-profile-${slug || "candidate"}.pdf`;
}
