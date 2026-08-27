import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { normalizeRoleInterviewReport } from "@/lib/careers/types";
import { renderRoleInterviewReportPdf } from "@/lib/reports/renderRoleInterviewReportPdf";
import { findRoleReportRow } from "@/lib/careers/roleReportLookup";

// Pages Router — see src/pages/api/careers/interview/report/pdf.ts for why
// (@react-pdf/renderer crashes inside the App Router).
// Downloads the role hiring summary as a PDF — HR's edited copy if one
// exists, otherwise the original AI report.
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
    const report = normalizeRoleInterviewReport(row.report_edit ?? row.report);

    const pdfBuffer = await renderRoleInterviewReportPdf(report);
    const fileName = `role-hiring-summary-${row.role_title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("[GET /api/careers/interview/role-report/pdf]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
