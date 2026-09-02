"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  DEFAULT_INSTITUTION_TYPE_LABELS,
  RECRUITMENT_INSTITUTION_TYPES_LIST,
  RECRUITMENT_MODULE_ID,
  resolveInstitutionTypeLabels,
} from "@/lib/systemDefinitions/recruitmentDefaults";
import type { SystemOption } from "@/lib/systemDefinitions";

export function useInstitutionTypes() {
  const { data: options = [], isLoading } = useQuery({
    queryKey: ["institution_types", RECRUITMENT_MODULE_ID],
    queryFn: async () => {
      const res = await api.get("/system-definitions/options", {
        params: {
          module_id: RECRUITMENT_MODULE_ID,
          option_list: RECRUITMENT_INSTITUTION_TYPES_LIST,
        },
      });
      return res.data.data as SystemOption[];
    },
    staleTime: 60_000,
  });

  const labels =
    options.length > 0
      ? resolveInstitutionTypeLabels(options)
      : [...DEFAULT_INSTITUTION_TYPE_LABELS];

  return { institutionTypes: labels, isLoading };
}
