import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { normalizeInterviewFormData } from "@/lib/careers/types";
import { renderInterviewReportPdf } from "@/lib/reports/renderInterviewReportPdf";

// This lives in the Pages Router (src/pages/api/...) rather than the App
// Router, for the same reason as src/pages/api/task-manager/reports/send.tsx:
// @react-pdf/renderer's renderToBuffer() crashes with "Minified React error
// #31" specifically inside Next's App Router request handling (unresolved
// upstream issue — see https://github.com/diegomura/react-pdf/issues/2994).
// Downloads the interview report as a PDF — whichever version is current
// (HR's edited copy if one exists, otherwise the original AI report).
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
  if (!applicationId || typeof applicationId !== "string") {
    return res.status(400).json({ error: "application_id is required." });
  }

  try {
    const { data: application, error: fetchError } = await supabaseAdmin
      .from("job_applications")
      .select("full_name, interview_form_data")
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      return res.status(404).json({ error: fetchError?.message ?? "Application not found." });
    }

    const formData = normalizeInterviewFormData(application.interview_form_data);
    const report = formData.summary?.interview_report_edit ?? formData.summary?.interview_report;

    if (!report) {
      return res.status(400).json({ error: "No interview report has been generated for this applicant yet." });
    }

    const pdfBuffer = await renderInterviewReportPdf(report);
    const fileName = `interview-report-${application.full_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("[GET /api/careers/interview/report/pdf]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
