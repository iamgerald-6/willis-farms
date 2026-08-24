import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ONBOARDING_HR_FIELDS_LIST,
} from "@/lib/systemDefinitions/onboardingHrDefaults";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";
import { fetchSystemOptions } from "@/lib/systemDefinitions/getOptions";
import {
  resolveOnboardingHrFields,
  type OnboardingHrFieldDef,
} from "@/lib/careers/onboardingHrFormSchema";

export async function fetchOnboardingHrFields(
  supabase: SupabaseClient,
): Promise<OnboardingHrFieldDef[]> {
  const options = await fetchSystemOptions(
    supabase,
    RECRUITMENT_MODULE_ID,
    ONBOARDING_HR_FIELDS_LIST,
  );
  return resolveOnboardingHrFields(options);
}
