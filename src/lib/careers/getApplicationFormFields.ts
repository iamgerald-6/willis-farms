import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeApplicationFields,
  type ApplicationFormField,
} from "@/lib/careers/applicationFormSchema";
import {
  RECRUITMENT_APPLICATION_FIELDS_LIST,
  RECRUITMENT_MODULE_ID,
  getDefaultApplicationFormFields,
} from "@/lib/systemDefinitions/recruitmentDefaults";
import type { SystemOption } from "@/lib/systemDefinitions";

export async function fetchApplicationFormFields(
  supabase: SupabaseClient,
): Promise<ApplicationFormField[]> {
  const { data, error } = await supabase
    .from("system_options")
    .select("*")
    .eq("module_id", RECRUITMENT_MODULE_ID)
    .eq("option_list", RECRUITMENT_APPLICATION_FIELDS_LIST)
    .order("sort_order", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return normalizeApplicationFields(getDefaultApplicationFormFields());
    }
    throw error;
  }

  const rows = (data ?? []) as SystemOption[];
  if (rows.length === 0) {
    return normalizeApplicationFields(getDefaultApplicationFormFields());
  }

  return normalizeApplicationFields(rows);
}
