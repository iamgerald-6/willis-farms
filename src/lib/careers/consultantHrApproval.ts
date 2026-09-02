import type { SupabaseClient } from "@supabase/supabase-js";
import { isConsultantGrade } from "@/lib/systemDefinitions/gradeLevelsConfig";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";

export type ConsultantUserProfile = {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  grade_level: string | null;
  supervisor_id: string | null;
};

export function consultantDisplayName(user: ConsultantUserProfile): string {
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || user.email;
}

export function isHeadConsultant(user: ConsultantUserProfile): boolean {
  return isConsultantGrade(user.grade_level) && !user.supervisor_id?.trim();
}

export function isSubordinateConsultant(user: ConsultantUserProfile): boolean {
  return isConsultantGrade(user.grade_level) && Boolean(user.supervisor_id?.trim());
}

export async function loadConsultantUserProfile(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<ConsultantUserProfile | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id, email, first_name, last_name, grade_level, supervisor_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.user_id) return null;
  return data as ConsultantUserProfile;
}

export function usesConsultantHrApproval(hr: OnboardingHrData | null | undefined): boolean {
  return Boolean(
    hr?.hr_approval_supervisor_id?.trim() || hr?.hr_review_mode === "consultant",
  );
}

export function canConsultantApproveOnboarding(input: {
  caller: ConsultantUserProfile;
  hr: OnboardingHrData;
}): boolean {
  const { caller, hr } = input;
  if (!isConsultantGrade(caller.grade_level)) return false;

  if (isHeadConsultant(caller)) {
    return !hr.hr_approval_supervisor_id?.trim();
  }

  const supervisorId = hr.hr_approval_supervisor_id?.trim();
  return Boolean(supervisorId && supervisorId === caller.user_id);
}
