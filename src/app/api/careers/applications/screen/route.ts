import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { screenApplication } from "@/lib/careers/screenApplication";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const { application_id } = await req.json();
    if (!application_id) {
      return NextResponse.json({ error: "application_id is required." }, { status: 400 });
    }

    const { data: application, error: fetchError } = await supabaseAdmin
      .from("job_applications")
      .select(
        "id, status, submission_status, ai_screening, role_title, role_slug, job_posting_id, cv_url, application_form_data, application_form_fields_snapshot",
      )
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return NextResponse.json(
        { error: fetchError?.message ?? "Application not found." },
        { status: 404 },
      );
    }

    if (application.submission_status === "draft") {
      return NextResponse.json({ error: "Draft applications cannot be screened." }, { status: 400 });
    }

    if (application.ai_screening) {
      return NextResponse.json(
        { error: "This application has already been screened by AI." },
        { status: 400 },
      );
    }

    if (application.status !== "applied") {
      return NextResponse.json(
        { error: "Only new applications awaiting AI shortlisting can be screened." },
        { status: 400 },
      );
    }

    const result = await screenApplication(supabaseAdmin, application);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const { data: updated, error: reloadError } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (reloadError || !updated) {
      return NextResponse.json(
        { error: reloadError?.message ?? "Screening completed but reload failed." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
      screening: {
        status: result.status,
        score: result.score,
        summary: result.summary,
        certificate_validation_summary: result.certificate_validation_summary,
      },
    });
  } catch (err) {
    console.error("[POST /api/careers/applications/screen]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
