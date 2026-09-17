import { renderToBuffer } from "@react-pdf/renderer";
import type { RoleInterviewReport } from "@/lib/careers/types";
import RoleInterviewReportDocument from "@/lib/reports/RoleInterviewReportDocument";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchCompanyBranding } from "@/lib/systemDefinitions/companyBrandingConfig";

export async function renderRoleInterviewReportPdf(report: RoleInterviewReport): Promise<Buffer> {
  const supabaseAdmin = getSupabaseAdmin();
  const branding = supabaseAdmin ? await fetchCompanyBranding(supabaseAdmin) : undefined;
  return renderToBuffer(
    <RoleInterviewReportDocument
      report={report}
      companyLogoUrl={branding?.logoUrl ?? null}
      companyPrimaryColor={branding?.primaryColor}
    />,
  );
}
