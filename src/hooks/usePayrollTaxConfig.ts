"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  DEFAULT_PAYROLL_TAX_CONFIG,
  normalizePayrollTaxConfig,
  type PayrollTaxConfig,
} from "@/lib/systemDefinitions/payrollTaxConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

/** Same query key PayrollTaxSettingsEditor.tsx uses for mod:recruitment's
 * module config — saving there invalidates this hook's cache too. */
export const PAYROLL_TAX_CONFIG_QUERY_KEY = [
  "system_module_config",
  RECRUITMENT_MODULE_ID,
] as const;

export function usePayrollTaxConfig() {
  const query = useQuery({
    queryKey: [...PAYROLL_TAX_CONFIG_QUERY_KEY],
    queryFn: async () => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(RECRUITMENT_MODULE_ID)}`,
      );
      return normalizePayrollTaxConfig(res.data.data?.businessLogic?.payrollTaxConfig);
    },
  });

  return {
    ...query,
    config: (query.data ?? DEFAULT_PAYROLL_TAX_CONFIG) as PayrollTaxConfig,
  };
}
