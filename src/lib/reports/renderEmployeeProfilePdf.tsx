import { renderToBuffer } from "@react-pdf/renderer";
import type { EmployeeProfileExportData } from "@/lib/careers/loadEmployeeProfileExportData";
import EmployeeProfileDocument from "@/lib/reports/EmployeeProfileDocument";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchCompanyBranding } from "@/lib/systemDefinitions/companyBrandingConfig";

export async function renderEmployeeProfilePdf(
  data: EmployeeProfileExportData,
): Promise<Buffer> {
  const supabaseAdmin = getSupabaseAdmin();
  const branding = supabaseAdmin ? await fetchCompanyBranding(supabaseAdmin) : undefined;
  return renderToBuffer(
    <EmployeeProfileDocument data={data} companyPrimaryColor={branding?.primaryColor} />,
  );
}
