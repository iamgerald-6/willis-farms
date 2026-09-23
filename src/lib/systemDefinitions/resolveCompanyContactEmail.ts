import { getReplyToEmail } from "@/lib/email/resendClient";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { ModuleBusinessLogic } from "./sectionWeightRules";
import {
  DEFAULT_COMPANY_CONTACT_EMAIL,
  fetchCompanyBranding,
  resolveCompanyContactEmail,
} from "./companyBrandingConfig";

/** Server-side HR / public contact inbox — env override, then Company branding, then default. */
export async function resolveCompanyContactEmailForSend(): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return getReplyToEmail();
  }
  const branding = await fetchCompanyBranding(supabase);
  return getReplyToEmail(branding.contactEmail);
}

/** Same value for SSR pages that already have a Supabase client. */
export function contactEmailFromBranding(
  businessLogic?: Pick<ModuleBusinessLogic, "companyBranding"> | null,
): string {
  return resolveCompanyContactEmail(businessLogic);
}

export async function getCompanyContactEmailServer(): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return DEFAULT_COMPANY_CONTACT_EMAIL;
  const branding = await fetchCompanyBranding(supabase);
  return branding.contactEmail;
}

export { DEFAULT_COMPANY_CONTACT_EMAIL };
