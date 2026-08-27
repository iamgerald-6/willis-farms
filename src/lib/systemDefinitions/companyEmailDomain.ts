import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchModuleConfig } from "./getModuleConfig";
import { RECRUITMENT_MODULE_ID } from "./recruitmentDefaults";
import type { ModuleBusinessLogic } from "./sectionWeightRules";

export const DEFAULT_COMPANY_EMAIL_DOMAIN = "willsfarms.com";

/** Normalize stored domain — strips leading @ and invalid characters. */
export function normalizeCompanyEmailDomain(raw: unknown): string {
  const trimmed = String(raw ?? "").trim().toLowerCase();
  const withoutAt = trimmed.replace(/^@+/, "");
  const cleaned = withoutAt.replace(/[^a-z0-9.-]/g, "");
  return cleaned || DEFAULT_COMPANY_EMAIL_DOMAIN;
}

export function resolveCompanyEmailDomain(
  businessLogic?: Pick<ModuleBusinessLogic, "companyEmailDomain"> | null,
): string {
  return normalizeCompanyEmailDomain(businessLogic?.companyEmailDomain);
}

export function formatCompanyEmailDomainSuffix(domain?: string): string {
  return `@${normalizeCompanyEmailDomain(domain)}`;
}

export function splitCompanyEmail(
  value: string | null | undefined,
  domain?: string,
): { local: string; domain: string } {
  const resolvedDomain = normalizeCompanyEmailDomain(domain);
  const trimmed = String(value ?? "").trim().toLowerCase();
  const atIdx = trimmed.lastIndexOf("@");

  if (atIdx > 0) {
    return {
      local: trimmed.slice(0, atIdx),
      domain: trimmed.slice(atIdx + 1) || resolvedDomain,
    };
  }

  return {
    local: trimmed.replace(/@.*/, ""),
    domain: resolvedDomain,
  };
}

export function joinCompanyEmail(local: string, domain?: string): string {
  const localPart = local.trim().toLowerCase().replace(/@.*/g, "");
  if (!localPart) return "";
  return `${localPart}@${normalizeCompanyEmailDomain(domain)}`;
}

export async function fetchCompanyEmailDomain(
  supabase: SupabaseClient,
): Promise<string> {
  const config = await fetchModuleConfig(supabase, RECRUITMENT_MODULE_ID);
  return resolveCompanyEmailDomain(config.businessLogic);
}

export function gitFallbackCompanyEmailDomain(): string {
  return DEFAULT_COMPANY_EMAIL_DOMAIN;
}
