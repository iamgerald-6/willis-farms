import { renderToBuffer } from "@react-pdf/renderer";
import type { InterviewReport } from "@/lib/careers/types";
import InterviewReportDocument from "@/lib/reports/InterviewReportDocument";

export async function renderInterviewReportPdf(report: InterviewReport): Promise<Buffer> {
  return renderToBuffer(<InterviewReportDocument report={report} />);
}
