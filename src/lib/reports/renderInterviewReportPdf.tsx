import { renderToBuffer } from "@react-pdf/renderer";
import type { InterviewReport } from "@/lib/careers/types";
import InterviewReportDocument from "@/lib/reports/InterviewReportDocument";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchCompanyBranding } from "@/lib/systemDefinitions/companyBrandingConfig";

export async function renderInterviewReportPdf(report: InterviewReport): Promise<Buffer> {
  // Same HR-editable logo the offer letter uses (System Definitions →
  // Offer letter → Company branding) — fetched here rather than threaded
  // through every caller, so none of the existing call sites need to change.
  const supabaseAdmin = getSupabaseAdmin();
  const branding = supabaseAdmin ? await fetchCompanyBranding(supabaseAdmin) : undefined;
  return renderToBuffer(
    <InterviewReportDocument
      report={report}
      companyLogoUrl={branding?.logoUrl ?? null}
      companyPrimaryColor={branding?.primaryColor}
    />,
  );
}
