import { renderToBuffer } from "@react-pdf/renderer";
import type { EmployeeProfileExportData } from "@/lib/careers/loadEmployeeProfileExportData";
import EmployeeProfileDocument from "@/lib/reports/EmployeeProfileDocument";

export async function renderEmployeeProfilePdf(
  data: EmployeeProfileExportData,
): Promise<Buffer> {
  return renderToBuffer(<EmployeeProfileDocument data={data} />);
}
