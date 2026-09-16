import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  normalizeRoleInterviewReport,
  type RoleInterviewReport,
  type RoleInterviewReportRow,
} from "@/lib/careers/types";
import { findRoleReportRow } from "@/lib/careers/roleReportLookup";
import { requireRecruitmentAccess } from "@/lib/apiRequestAuth";
import { assertSiteAccess } from "@/lib/siteAccess";

export async function GET(req: NextRequest) {
  const authedUser = await requireRecruitmentAccess(req);
  if (!authedUser) {
    return NextResponse.json(
      { error: "Forbidden — Recruitment view access is required." },
      { status: 403 },
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // job_posting_id identifies a specific hiring round and is required —
  // see findRoleReportRow.
  const jobPostingId = req.nextUrl.searchParams.get("job_posting_id");
  if (!jobPostingId) {
    return NextResponse.json({ error: "job_posting_id is required." }, { status: 400 });
  }

  const { data: postingRow } = await supabaseAdmin
    .from("job_postings")
    .select("site_id")
    .eq("id", jobPostingId)
    .maybeSingle();
  if (!postingRow || !assertSiteAccess(authedUser, postingRow.site_id)) {
    return NextResponse.json(
      { error: "Forbidden — this posting isn't at a site you have access to." },
      { status: 403 },
    );
  }

  try {
    const { data, error } = await findRoleReportRow(supabaseAdmin, {
      jobPostingId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = data;
    const normalized: RoleInterviewReportRow | null = row
      ? {
          ...row,
          report: normalizeRoleInterviewReport(row.report),
          report_edit: row.report_edit ? normalizeRoleInterviewReport(row.report_edit) : null,
        }
      : null;

    return NextResponse.json({ success: true, data: normalized });
  } catch (err) {
    console.error("[GET /api/careers/interview/role-report]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Saves HR's edits — always writes to report_edit (never overwrites the
// original AI-generated `report`), and appends one entry per save to
// report_edit_log. Mirrors the per-applicant interview report PATCH route.
export async function PATCH(req: NextRequest) {
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
    const {
      job_posting_id,
      report,
      edited_by,
    }: {
      job_posting_id?: string;
      report?: RoleInterviewReport;
      edited_by?: string;
    } = await req.json();

    if (!job_posting_id || !report) {
      return NextResponse.json(
        { error: "job_posting_id and report are required." },
        { status: 400 },
      );
    }

    const { data: postingRow } = await supabaseAdmin
      .from("job_postings")
      .select("site_id")
      .eq("id", job_posting_id)
      .maybeSingle();
    if (!postingRow || !assertSiteAccess(authedUser, postingRow.site_id)) {
      return NextResponse.json(
        { error: "Forbidden — this posting isn't at a site you have access to." },
        { status: 403 },
      );
    }

    const { data: existing, error: fetchError } = await findRoleReportRow(supabaseAdmin, {
      jobPostingId: job_posting_id,
    });

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json(
        { error: "No report has been generated for this hiring round yet." },
        { status: 400 },
      );
    }

    const editLog = Array.isArray(existing.report_edit_log) ? existing.report_edit_log : [];
    editLog.push({ edited_at: new Date().toISOString(), edited_by: edited_by ?? "unknown" });

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("role_interview_reports")
      .update({
        report_edit: report,
        report_edit_log: editLog,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated as RoleInterviewReportRow });
  } catch (err) {
    console.error("[PATCH /api/careers/interview/role-report]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
