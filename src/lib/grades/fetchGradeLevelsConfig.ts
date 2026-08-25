import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchModuleConfig } from "@/lib/systemDefinitions/getModuleConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";
import type { GradeLevelsConfig } from "@/lib/systemDefinitions/gradeLevelsConfig";

/** Load grade levels config from System Definitions (mod:recruitment). */
export async function fetchGradeLevelsConfig(
  supabase: SupabaseClient,
): Promise<GradeLevelsConfig> {
  const moduleConfig = await fetchModuleConfig(supabase, RECRUITMENT_MODULE_ID);
  return moduleConfig.businessLogic.gradeLevelsConfig ?? {};
}
