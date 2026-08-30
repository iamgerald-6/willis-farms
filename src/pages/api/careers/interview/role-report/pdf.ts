import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { normalizeRoleInterviewReport } from "@/lib/careers/types";
import { renderRoleInterviewReportPdf } from "@/lib/reports/renderRoleInterviewReportPdf";
import { findRoleReportRow } from "@/lib/careers/roleReportLookup";
import { zipReportPdfs } from "@/lib/reports/zipReportPdfs";

// Pages Router — see src/pages/api/careers/interview/report/pdf.ts for why
// (@react-pdf/renderer crashes inside the App Router).
// Downloads the role hiring summary as a PDF. If HR has saved an edited
// copy, downloads a zip containing both the AI-generated original and the
// edited version; otherwise downloads the single AI-generated PDF.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const jobPostingId = req.query.job_posting_id;
  const roleSlug = req.query.role_slug;
  if ((!jobPostingId || typeof jobPostingId !== "string") && (!roleSlug || typeof roleSlug !== "string")) {
    return res.status(400).json({ error: "job_posting_id or role_slug is required." });
  }

  try {
    const { data, error: fetchError } = await findRoleReportRow(supabaseAdmin, {
      jobPostingId: typeof jobPostingId === "string" ? jobPostingId : null,
      roleSlug: typeof roleSlug === "string" ? roleSlug : null,
    });

    if (fetchError || !data) {
      return res.status(404).json({ error: fetchError?.message ?? "No report found for this hiring round." });
    }

    const row = data;
    const baseFileName = `role-hiring-summary-${row.role_title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

    if (row.report && row.report_edit) {
      const aiReport = normalizeRoleInterviewReport(row.report);
      const editedReport = normalizeRoleInterviewReport(row.report_edit);
      const [aiBuffer, editedBuffer] = await Promise.all([
        renderRoleInterviewReportPdf(aiReport),
        renderRoleInterviewReportPdf(editedReport),
      ]);
      const zipBuffer = await zipReportPdfs([
        { filename: `${baseFileName}-ai-generated.pdf`, buffer: aiBuffer },
        { filename: `${baseFileName}-edited.pdf`, buffer: editedBuffer },
      ]);

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${baseFileName}.zip"`);
      return res.status(200).send(zipBuffer);
    }

    const report = normalizeRoleInterviewReport(row.report_edit ?? row.report);
    const pdfBuffer = await renderRoleInterviewReportPdf(report);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${baseFileName}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("[GET /api/careers/interview/role-report/pdf]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
