"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  resolveAppraisalGradeBandLabels,
  resolveGradeLevelOptions,
  resolveGradeOrder,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";

/** Grade levels now live in the Organizational Structure "Grade levels"
 * catalog (grade_levels table) — see
 * docs/organizational-structure/grade-levels-catalog-fields.sql — not the
 * old System Definitions (mod:recruitment) business-logic JSON blob. */
export const GRADE_LEVELS_CONFIG_QUERY_KEY = [
  "org_structure_grade_levels_config",
] as const;

async function fetchGradeLevelsConfigClient(): Promise<GradeLevelsConfig | null> {
  const res = await api.get("/system-definitions/grade-levels-config");
  return (res.data.data as GradeLevelsConfig | undefined) ?? null;
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
  };
}
