"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  resolveAccessControlBandLabels,
  resolveAppraisalGradeBandLabels,
  resolveGradeLevelOptions,
  resolveGradeOrder,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

export const GRADE_LEVELS_CONFIG_QUERY_KEY = [
  "system_module_config",
  RECRUITMENT_MODULE_ID,
  "grade_levels",
] as const;

async function fetchGradeLevelsConfigClient(): Promise<GradeLevelsConfig | null> {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(RECRUITMENT_MODULE_ID)}`,
  );
  return (
    (res.data.data?.businessLogic?.gradeLevelsConfig as GradeLevelsConfig | undefined) ??
    null
  );
}

export function useGradeLevelsConfig() {
  const query = useQuery({
    queryKey: [...GRADE_LEVELS_CONFIG_QUERY_KEY],
    queryFn: fetchGradeLevelsConfigClient,
  });

  const config = query.data ?? undefined;

  return {
    ...query,
    config,
    gradeOrder: resolveGradeOrder(config),
    gradeOptions: resolveGradeLevelOptions(config),
    appraisalBandLabels: resolveAppraisalGradeBandLabels(config),
    accessControlBandLabels: resolveAccessControlBandLabels(config),
  };
}
