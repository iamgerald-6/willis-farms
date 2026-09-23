import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchModuleConfig } from "./getModuleConfig";
import { RECRUITMENT_MODULE_ID } from "./recruitmentDefaults";
import type { ModuleBusinessLogic } from "./sectionWeightRules";

/**
 * Company letterhead branding for generated documents (currently the offer
 * letter — logo in the header, plus the same logo reused as the faint page
 * watermark, and the postal/location address text). HR can change either
 * from System Definitions → Offer letter → Company branding, instead of a
 * developer having to re-bake a new letterhead PNG into the codebase every
 * time the logo or address changes (see offerLetterBranding.ts for the
 * hardcoded fallback used until HR uploads a logo for the first time).
 */
export interface CompanyBrandingConfig {
  /** Cloudinary URL of the uploaded logo — used for both the letterhead
   * header image and, at reduced opacity, the page watermark. */
  logoUrl?: string;
  logoPublicId?: string;
  /** Public HR / careers contact inbox — used in emails, careers page,
   * onboarding “contact HR”, and synced into the letterhead email line. */
  contactEmail?: string;
  /** Free-text address/contact block, one line per array entry, rendered
   * next to the logo in the letterhead. */
  addressLines?: string[];
  /** Accent/brand color (hex, e.g. "#991B1B") used across every generated
   * PDF — section titles, dividers, highlight bars, the cover page rule
   * and site badge (see ReportCoverPage.tsx). Functional status colors
   * (overdue/amber, completed/green, etc.) are deliberately NOT tied to
   * this — only the brand accent is. */
  primaryColor?: string;
}

export const DEFAULT_COMPANY_CONTACT_EMAIL = "info@willsfarms.com";

const EMAIL_LINE_RE = /^email\s*:/i;

export function formatEmailAddressLine(email: string): string {
  return `Email: ${email.trim()}`;
}

/** Keep the letterhead “Email: …” row aligned with contactEmail on save. */
export function syncEmailLineInAddressLines(
  addressLines: string[] | undefined,
  contactEmail: string,
): string[] {
  const emailLine = formatEmailAddressLine(contactEmail);
  const lines =
    addressLines && addressLines.length > 0
      ? [...addressLines]
      : defaultCompanyAddressLines(contactEmail).filter((l) => !EMAIL_LINE_RE.test(l));

  const idx = lines.findIndex((line) => EMAIL_LINE_RE.test(line.trim()));
  if (idx >= 0) {
    lines[idx] = emailLine;
  } else {
    const telIdx = lines.findIndex((line) => /^tel\s*:/i.test(line.trim()));
    if (telIdx >= 0) lines.splice(telIdx, 0, emailLine);
    else lines.push(emailLine);
  }
  return lines;
}

/** Matches the address block baked into the original letterhead artwork,
 * so a letter generated before HR configures branding looks the same as
 * it always has. */
export function defaultCompanyAddressLines(
  contactEmail: string = DEFAULT_COMPANY_CONTACT_EMAIL,
): string[] {
  return [
    "Location Address: EC-538-0449, Yaw Dimeu, Nsawam-Hatar Road, Eastern Region",
    "Postal Address: WY 2852, Kwabenya, Accra",
    formatEmailAddressLine(contactEmail),
    "Tel: +233 205 275 722 / +233 204 247 40",
  ];
}

export const DEFAULT_COMPANY_ADDRESS_LINES: string[] =
  defaultCompanyAddressLines();

/** Matches the color already baked into the original letterhead artwork —
 * same default every PDF used before this became editable. */
export const DEFAULT_COMPANY_PRIMARY_COLOR = "#991B1B";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

export function isValidContactEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function normalizeContactEmail(raw: unknown): string | undefined {
  const trimmed = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!trimmed || !isValidContactEmail(trimmed)) return undefined;
  return trimmed;
}

function normalizeAddressLines(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const lines = raw
      .map((line) => (typeof line === "string" ? line.trim() : ""))
      .filter(Boolean);
    return lines.length > 0 ? lines : undefined;
  }
  if (typeof raw === "string" && raw.trim()) {
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length > 0 ? lines : undefined;
  }
  return undefined;
}

export function normalizeCompanyBrandingConfig(
  raw: unknown,
): CompanyBrandingConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const logoUrl =
    typeof obj.logoUrl === "string" && obj.logoUrl.trim()
      ? obj.logoUrl.trim()
      : undefined;
  const logoPublicId =
    typeof obj.logoPublicId === "string" && obj.logoPublicId.trim()
      ? obj.logoPublicId.trim()
      : undefined;
  const contactEmail = normalizeContactEmail(obj.contactEmail);
  const addressLines = normalizeAddressLines(obj.addressLines);
  const primaryColor =
    typeof obj.primaryColor === "string" && isValidHexColor(obj.primaryColor)
      ? obj.primaryColor.trim()
      : undefined;

  if (!logoUrl && !contactEmail && !addressLines && !primaryColor) return undefined;
  return { logoUrl, logoPublicId, contactEmail, addressLines, primaryColor };
}

export function resolveCompanyContactEmail(
  businessLogic?: Pick<ModuleBusinessLogic, "companyBranding"> | null,
): string {
  return (
    normalizeContactEmail(businessLogic?.companyBranding?.contactEmail) ??
    DEFAULT_COMPANY_CONTACT_EMAIL
  );
}

/** Effective branding — HR's saved config with the original hardcoded
 * artwork's values filled in wherever HR hasn't overridden them yet. */
export function resolveCompanyBranding(
  businessLogic?: Pick<ModuleBusinessLogic, "companyBranding"> | null,
): {
  logoUrl?: string;
  contactEmail: string;
  addressLines: string[];
  primaryColor: string;
} {
  const saved = businessLogic?.companyBranding;
  const contactEmail = resolveCompanyContactEmail(businessLogic);
  const rawAddressLines = saved?.addressLines ?? defaultCompanyAddressLines(contactEmail);
  return {
    logoUrl: saved?.logoUrl,
    contactEmail,
    addressLines: syncEmailLineInAddressLines(rawAddressLines, contactEmail),
    primaryColor: saved?.primaryColor ?? DEFAULT_COMPANY_PRIMARY_COLOR,
  };
}

export async function fetchCompanyBranding(
  supabase: SupabaseClient,
): Promise<{
  logoUrl?: string;
  contactEmail: string;
  addressLines: string[];
  primaryColor: string;
}> {
  const config = await fetchModuleConfig(supabase, RECRUITMENT_MODULE_ID);
  return resolveCompanyBranding(config.businessLogic);
}

export async function fetchCompanyContactEmail(
  supabase: SupabaseClient,
): Promise<string> {
  const branding = await fetchCompanyBranding(supabase);
  return branding.contactEmail;
}
