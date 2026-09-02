import { renderToBuffer } from "@react-pdf/renderer";
import OfferLetterDocument, {
  type OfferLetterPdfPayload,
} from "@/lib/reports/OfferLetterDocument";

export async function renderOfferLetterPdf(
  payload: OfferLetterPdfPayload,
): Promise<Buffer> {
  return renderToBuffer(<OfferLetterDocument data={payload} />);
}
