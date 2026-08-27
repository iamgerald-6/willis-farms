import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  normalizeRoleInterviewReport,
  type RoleInterviewReport,
  type RoleInterviewReportRow,
} from "@/lib/careers/types";
import { findRoleReportRow } from "@/lib/careers/roleReportLookup";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // job_posting_id identifies a specific hiring round and is what every
  // current caller sends. role_slug alone is kept only as a fallback for
  // applicants whose report predates round-scoping (job_posting_id null) —
  // see findRoleReportRow.
  const jobPostingId = req.nextUrl.searchParams.get("job_posting_id");
  const roleSlug = req.nextUrl.searchParams.get("role_slug");
  if (!jobPostingId && !roleSlug) {
    return NextResponse.json({ error: "job_posting_id or role_slug is required." }, { status: 400 });
  }

  try {
    const { data, error } = await findRoleReportRow(supabaseAdmin, {
      jobPostingId,
      roleSlug,
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
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const {
      job_posting_id,
      role_slug,
      report,
      edited_by,
    }: {
      job_posting_id?: string;
      role_slug?: string;
      report?: RoleInterviewReport;
      edited_by?: string;
    } = await req.json();

    if ((!job_posting_id && !role_slug) || !report) {
      return NextResponse.json(
        { error: "job_posting_id (or role_slug) and report are required." },
        { status: 400 },
      );
    }

    const { data: existing, error: fetchError } = await findRoleReportRow(supabaseAdmin, {
      jobPostingId: job_posting_id,
      roleSlug: role_slug,
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
