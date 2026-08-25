import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeApplicationFields,
  resolveApplicationSteps,
  type ApplicationFormField,
} from "@/lib/careers/applicationFormSchema";
import {
  parseApplicationFormFieldsSnapshot,
  normalizeApplicationFormConfig,
  serializeApplicationFormFieldsSnapshot,
  type ApplicationFormConfig,
} from "@/lib/systemDefinitions/applicationFormConfig";
import {
  RECRUITMENT_APPLICATION_FIELDS_LIST,
  RECRUITMENT_MODULE_ID,
  getDefaultApplicationFormFields,
} from "@/lib/systemDefinitions/recruitmentDefaults";
import type { SystemOption } from "@/lib/systemDefinitions";

export type ApplicationFormContext = {
  fields: ApplicationFormField[];
  config: ApplicationFormConfig;
  steps: string[];
};

export async function fetchApplicationFormConfig(
  supabase: SupabaseClient,
): Promise<ApplicationFormConfig> {
  const { data, error } = await supabase
    .from("system_modules")
    .select("business_logic")
    .eq("id", RECRUITMENT_MODULE_ID)
    .maybeSingle();

  if (error || !data?.business_logic) return {};

  const logic = data.business_logic as Record<string, unknown>;
  return normalizeApplicationFormConfig(logic.applicationFormConfig);
}

async function fetchApplicationFormOptions(
  supabase: SupabaseClient,
): Promise<SystemOption[]> {
  const { data, error } = await supabase
    .from("system_options")
    .select("*")
    .eq("module_id", RECRUITMENT_MODULE_ID)
    .eq("option_list", RECRUITMENT_APPLICATION_FIELDS_LIST)
    .order("sort_order", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return getDefaultApplicationFormFields();
    }
    throw error;
  }

  const rows = (data ?? []) as SystemOption[];
  if (rows.length === 0) {
    return getDefaultApplicationFormFields();
  }

  return rows;
}

export async function fetchApplicationFormContext(
  supabase: SupabaseClient,
): Promise<ApplicationFormContext> {
  const [options, config] = await Promise.all([
    fetchApplicationFormOptions(supabase),
    fetchApplicationFormConfig(supabase),
  ]);
  const fields = normalizeApplicationFields(options, config);
  const steps = resolveApplicationSteps(config);
  return { fields, config, steps };
}

/** Live form definition from system settings (new applications before first save). */
export async function fetchApplicationFormFields(
  supabase: SupabaseClient,
): Promise<ApplicationFormField[]> {
  const ctx = await fetchApplicationFormContext(supabase);
  return ctx.fields;
}

export function applicationFormContextFromSnapshot(
  snapshot: unknown,
): ApplicationFormContext | null {
  const parsed = parseApplicationFormFieldsSnapshot(snapshot);
  if (!parsed) return null;
  return {
    fields: parsed.fields,
    config: parsed.config,
    steps: resolveApplicationSteps(parsed.config),
  };
}

export function buildApplicationFormSnapshot(
  context: ApplicationFormContext,
): Record<string, unknown> {
  return serializeApplicationFormFieldsSnapshot(context.fields, context.config);
}
