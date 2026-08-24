import { renderToBuffer } from "@react-pdf/renderer";
import type { RoleInterviewReport } from "@/lib/careers/types";
import RoleInterviewReportDocument from "@/lib/reports/RoleInterviewReportDocument";

export async function renderRoleInterviewReportPdf(report: RoleInterviewReport): Promise<Buffer> {
  return renderToBuffer(<RoleInterviewReportDocument report={report} />);
}
