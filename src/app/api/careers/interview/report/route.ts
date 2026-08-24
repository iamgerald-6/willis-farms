import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { normalizeInterviewFormData, type InterviewReport } from "@/lib/careers/types";

// HR's edits to the AI-generated interview report always save to a
// separate copy (summary.interview_report_edit) — the original AI report
// (summary.interview_report) is never touched here. Every save appends an
// entry to summary.interview_report_edit_log so there's a record of when
// (and by whom) the report was changed.
export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const { application_id, report, edited_by } = (await req.json()) as {
      application_id?: string;
      report?: InterviewReport;
      edited_by?: string;
    };

    if (!application_id || !report) {
      return NextResponse.json(
        { error: "application_id and report are required." },
        { status: 400 },
      );
    }

    const { data: application, error: fetchError } = await supabaseAdmin
      .from("job_applications")
      .select("interview_form_data")
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return NextResponse.json(
        { error: fetchError?.message ?? "Application not found." },
        { status: 404 },
      );
    }

    const formData = normalizeInterviewFormData(application.interview_form_data);

    if (!formData.summary?.interview_report) {
      return NextResponse.json(
        { error: "Generate the interview report before editing it." },
        { status: 400 },
      );
    }

    const editLog = formData.summary.interview_report_edit_log ?? [];

    const updatedFormData = {
      ...formData,
      summary: {
        ...formData.summary,
        interview_report_edit: report,
        interview_report_edit_log: [
          ...editLog,
          { edited_at: new Date().toISOString(), edited_by: edited_by ?? "unknown" },
        ],
      },
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("job_applications")
      .update({ interview_form_data: updatedFormData })
      .eq("id", application_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        interview_form_data: normalizeInterviewFormData(updated.interview_form_data),
      },
    });
  } catch (err) {
    console.error("[PATCH /api/careers/interview/report]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
