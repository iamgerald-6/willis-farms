"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { APPRAISAL_MODULE_ID_CONST } from "@/lib/systemDefinitions/appraisalDefaults";
import {
  DEFAULT_APPRAISAL_SCOPE,
  normalizeAppraisalScopeConfig,
  resolveAppraisalFormKeyCovers,
  resolveAppraisalFormKeyLabels,
  resolveAppraisalFormOptions,
  type AppraisalScopeConfig,
} from "@/lib/systemDefinitions/appraisalScopeConfig";
import { useGradeLevelsConfig } from "@/hooks/useGradeLevelsConfig";

export const APPRAISAL_SCOPE_CONFIG_QUERY_KEY = [
  "system_module_config",
  APPRAISAL_MODULE_ID_CONST,
  "appraisal_scope",
] as const;

async function fetchAppraisalScopeConfigClient(): Promise<AppraisalScopeConfig> {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(APPRAISAL_MODULE_ID_CONST)}`,
  );
  return normalizeAppraisalScopeConfig(
    res.data.data?.businessLogic?.appraisalScopeConfig,
  );
}

export function useAppraisalScopeConfig() {
  const { config: gradeConfig } = useGradeLevelsConfig();

  const query = useQuery({
    queryKey: [...APPRAISAL_SCOPE_CONFIG_QUERY_KEY],
    queryFn: fetchAppraisalScopeConfigClient,
  });

  const scopeConfig = query.data ?? DEFAULT_APPRAISAL_SCOPE;

  return {
    ...query,
    scopeConfig,
    formOptions: resolveAppraisalFormOptions(scopeConfig, gradeConfig),
    formKeyCovers: resolveAppraisalFormKeyCovers(scopeConfig, gradeConfig),
    formKeyLabels: resolveAppraisalFormKeyLabels(scopeConfig, gradeConfig),
    isIndividual: scopeConfig.mode === "individual",
  };
}
