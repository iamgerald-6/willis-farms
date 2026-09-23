"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_COMPANY_CONTACT_EMAIL } from "@/lib/systemDefinitions/companyBrandingConfig";

export const COMPANY_CONTACT_EMAIL_QUERY_KEY = ["public_company_branding"] as const;

async function fetchCompanyContactEmailClient(): Promise<string> {
  const res = await fetch("/api/public/company-branding", { cache: "no-store" });
  if (!res.ok) return DEFAULT_COMPANY_CONTACT_EMAIL;
  const json = (await res.json()) as { contactEmail?: string };
  const email = json.contactEmail?.trim();
  return email || DEFAULT_COMPANY_CONTACT_EMAIL;
}

export function useCompanyContactEmail() {
  const query = useQuery({
    queryKey: [...COMPANY_CONTACT_EMAIL_QUERY_KEY],
    queryFn: fetchCompanyContactEmailClient,
    staleTime: 60_000,
  });

  return {
    ...query,
    contactEmail: query.data ?? DEFAULT_COMPANY_CONTACT_EMAIL,
  };
}
