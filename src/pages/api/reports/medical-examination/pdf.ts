import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { buildMedicalExamPdf } from "@/lib/medical/buildMedicalExamPdf";

// Pages Router — @react-pdf/renderer crashes in App Router (see offer-letter/pdf.ts).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const applicationId = req.query.application_id;
  const historyId = req.query.history_id;

  if (!applicationId || typeof applicationId !== "string") {
    return res.status(400).json({ error: "application_id is required." });
  }

  try {
    const result = await buildMedicalExamPdf(
      supabaseAdmin,
      applicationId,
      typeof historyId === "string" ? historyId : undefined,
    );

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.buffer);
  } catch (err) {
    console.error("[GET /api/reports/medical-examination/pdf]", err);
    return res.status(500).json({ error: "Failed to generate medical examination PDF." });
  }
}
