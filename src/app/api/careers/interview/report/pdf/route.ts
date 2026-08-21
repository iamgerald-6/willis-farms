import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { normalizeInterviewFormData } from "@/lib/careers/types";
import { renderInterviewReportPdf } from "@/lib/reports/renderInterviewReportPdf";

// Downloads the interview report as a PDF — whichever version is current
// (HR's edited copy if one exists, otherwise the original AI report).
export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const applicationId = req.nextUrl.searchParams.get("application_id");
  if (!applicationId) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  const { data: application, error: fetchError } = await supabaseAdmin
    .from("job_applications")
    .select("full_name, interview_form_data")
    .eq("id", applicationId)
    .single();

  if (fetchError || !application) {
    return NextResponse.json(
      { error: fetchError?.message ?? "Application not found." },
      { status: 404 },
    );
  }

  const formData = normalizeInterviewFormData(application.interview_form_data);
  const report = formData.summary?.interview_report_edit ?? formData.summary?.interview_report;

  if (!report) {
    return NextResponse.json(
      { error: "No interview report has been generated for this applicant yet." },
      { status: 400 },
    );
  }

  const pdfBuffer = await renderInterviewReportPdf(report);
  const fileName = `interview-report-${application.full_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
