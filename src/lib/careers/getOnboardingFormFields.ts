import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDefaultOnboardingFormFieldsFallback,
  mergeOnboardingFieldDefinitions,
  normalizeOnboardingFields,
  optionListLabelsFromOptions,
  type OnboardingFormField,
} from "@/lib/careers/onboardingFormSchema";
import {
  ONBOARDING_DEPARTMENTS_LIST,
  ONBOARDING_FIELDS_LIST,
  ONBOARDING_LOCATIONS_LIST,
  ONBOARDING_MEDICAL_REPORTS_LIST,
  RECRUITMENT_MODULE_ID,
  fetchOnboardingSiteAndDepartmentLabels,
  getDefaultOnboardingFormFields,
  getDefaultOnboardingMedicalReports,
} from "@/lib/systemDefinitions/onboardingDefaults";
import type { SystemOption } from "@/lib/systemDefinitions";

async function fetchOptionList(
  supabase: SupabaseClient,
  optionList: string,
  fallback: () => SystemOption[],
): Promise<string[]> {
  const { data, error } = await supabase
    .from("system_options")
    .select("*")
    .eq("module_id", RECRUITMENT_MODULE_ID)
    .eq("option_list", optionList)
    .order("sort_order", { ascending: true });

  if (error || !data?.length) {
    return optionListLabelsFromOptions(fallback());
  }
  return optionListLabelsFromOptions(data as SystemOption[]);
}

export async function fetchOnboardingFormFields(
  supabase: SupabaseClient,
): Promise<OnboardingFormField[]> {
  const { data, error } = await supabase
    .from("system_options")
    .select("*")
    .eq("module_id", RECRUITMENT_MODULE_ID)
    .eq("option_list", ONBOARDING_FIELDS_LIST)
    .order("sort_order", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return getDefaultOnboardingFormFieldsFallback();
    }
    throw error;
  }

  const rows = (data ?? []) as SystemOption[];
  const dbFields = normalizeOnboardingFields(rows);
  if (dbFields.length === 0) {
    return getDefaultOnboardingFormFieldsFallback();
  }

  return mergeOnboardingFieldDefinitions(dbFields);
}

export async function fetchOnboardingOptionLists(
  supabase: SupabaseClient,
): Promise<Record<string, string[]>> {
  const [{ sites, departments }, medicalReports] = await Promise.all([
    fetchOnboardingSiteAndDepartmentLabels(supabase),
    fetchOptionList(
      supabase,
      ONBOARDING_MEDICAL_REPORTS_LIST,
      getDefaultOnboardingMedicalReports,
    ),
  ]);

  return {
    [ONBOARDING_LOCATIONS_LIST]: sites,
    [ONBOARDING_DEPARTMENTS_LIST]: departments,
    [ONBOARDING_MEDICAL_REPORTS_LIST]: medicalReports,
  };
}

/** DB-unreachable fallback — Sites/Departments have no hardcoded stand-in
 * (they only ever come from the live catalog), so both are empty here. */
export function getGitOnboardingOptionLists(): Record<string, string[]> {
  return {
    [ONBOARDING_LOCATIONS_LIST]: [],
    [ONBOARDING_DEPARTMENTS_LIST]: [],
    [ONBOARDING_MEDICAL_REPORTS_LIST]: optionListLabelsFromOptions(
      getDefaultOnboardingMedicalReports(),
    ),
  };
}
