import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { screenApplication } from "@/lib/careers/screenApplication";
import { requireRecruitmentAccess } from "@/lib/apiRequestAuth";
import { assertSiteAccess, siteIdFromJoin } from "@/lib/siteAccess";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const authedUser = await requireRecruitmentAccess(req, "edit");
  if (!authedUser) {
    return NextResponse.json(
      { error: "Forbidden — Recruitment edit access is required." },
      { status: 403 },
    );
  }

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
        "id, status, submission_status, ai_screening, role_title, role_slug, job_posting_id, cv_url, application_form_data, application_form_fields_snapshot, job_postings(site_id)",
      )
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return NextResponse.json(
        { error: fetchError?.message ?? "Application not found." },
        { status: 404 },
      );
    }

    const applicationSiteId = siteIdFromJoin(application.job_postings);
    if (!assertSiteAccess(authedUser, applicationSiteId)) {
      return NextResponse.json(
        { error: "Forbidden — this application isn't at a site you have access to." },
        { status: 403 },
      );
    }

    if (application.submission_status === "draft") {
      return NextResponse.json({ error: "Draft applications cannot be screened." }, { status: 400 });
    }

    if (application.ai_screening) {
      return NextResponse.json(
        { error: "This application has already been screened by WillsOne Intel." },
        { status: 400 },
      );
    }

    if (application.status !== "applied") {
      return NextResponse.json(
        { error: "Only new applications awaiting WillsOne Intel shortlisting can be screened." },
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
