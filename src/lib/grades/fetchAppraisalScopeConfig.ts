import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchModuleConfig } from "@/lib/systemDefinitions/getModuleConfig";
import { APPRAISAL_MODULE_ID_CONST } from "@/lib/systemDefinitions/appraisalDefaults";
import {
  normalizeAppraisalScopeConfig,
  type AppraisalScopeConfig,
} from "@/lib/systemDefinitions/appraisalScopeConfig";

/** Load appraisal scope config from System Definitions (mod:appraisal). */
export async function fetchAppraisalScopeConfig(
  supabase: SupabaseClient,
): Promise<AppraisalScopeConfig> {
  const moduleConfig = await fetchModuleConfig(
    supabase,
    APPRAISAL_MODULE_ID_CONST,
  );
  return normalizeAppraisalScopeConfig(
    moduleConfig.businessLogic.appraisalScopeConfig,
  );
}
