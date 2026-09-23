import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  DEFAULT_COMPANY_CONTACT_EMAIL,
  resolveCompanyBranding,
} from "@/lib/systemDefinitions/companyBrandingConfig";

/** Public read-only company contact details for careers, footer, onboarding. */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      contactEmail: DEFAULT_COMPANY_CONTACT_EMAIL,
    });
  }

  try {
    const { fetchModuleConfig } = await import("@/lib/systemDefinitions/getModuleConfig");
    const { RECRUITMENT_MODULE_ID } = await import("@/lib/systemDefinitions/recruitmentDefaults");
    const config = await fetchModuleConfig(supabase, RECRUITMENT_MODULE_ID);
    const branding = resolveCompanyBranding(config.businessLogic);
    return NextResponse.json({
      contactEmail: branding.contactEmail,
    });
  } catch {
    return NextResponse.json({
      contactEmail: DEFAULT_COMPANY_CONTACT_EMAIL,
    });
  }
}
