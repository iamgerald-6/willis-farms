"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  formatCompanyEmailDomainSuffix,
  resolveCompanyEmailDomain,
} from "@/lib/systemDefinitions/companyEmailDomain";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

export const COMPANY_EMAIL_DOMAIN_QUERY_KEY = [
  "system_module_config",
  RECRUITMENT_MODULE_ID,
  "company_email_domain",
] as const;

async function fetchCompanyEmailDomainClient(): Promise<string> {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(RECRUITMENT_MODULE_ID)}`,
  );
  return resolveCompanyEmailDomain(res.data.data?.businessLogic);
}

export function useCompanyEmailDomain() {
  const query = useQuery({
    queryKey: [...COMPANY_EMAIL_DOMAIN_QUERY_KEY],
    queryFn: fetchCompanyEmailDomainClient,
  });

  const domain = query.data ?? resolveCompanyEmailDomain();

  return {
    ...query,
    domain,
    domainSuffix: formatCompanyEmailDomainSuffix(domain),
  };
}
