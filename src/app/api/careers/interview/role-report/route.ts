import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  normalizeRoleInterviewReport,
  type RoleInterviewReport,
  type RoleInterviewReportRow,
} from "@/lib/careers/types";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const roleSlug = req.nextUrl.searchParams.get("role_slug");
  if (!roleSlug) {
    return NextResponse.json({ error: "role_slug is required." }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("role_interview_reports")
      .select("*")
      .eq("role_slug", roleSlug)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = data as RoleInterviewReportRow | null;
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
      role_slug,
      report,
      edited_by,
    }: { role_slug?: string; report?: RoleInterviewReport; edited_by?: string } = await req.json();

    if (!role_slug || !report) {
      return NextResponse.json({ error: "role_slug and report are required." }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("role_interview_reports")
      .select("report_edit_log")
      .eq("role_slug", role_slug)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json(
        { error: "No report has been generated for this role yet." },
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
      .eq("role_slug", role_slug)
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
