import { renderToBuffer } from "@react-pdf/renderer";
import MedicalExamDocument, {
  type MedicalExamPdfPayload,
} from "@/lib/reports/MedicalExamDocument";

export async function renderMedicalExamPdf(payload: MedicalExamPdfPayload): Promise<Buffer> {
  return renderToBuffer(<MedicalExamDocument data={payload} />);
}

export function medicalExamPdfFilename(candidateName: string): string {
  const safeName = candidateName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `medical-examination-${safeName}.pdf`;
}
