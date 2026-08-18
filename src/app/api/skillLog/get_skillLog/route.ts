import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  getSkillLogAuthContext,
  jsonForbidden,
  jsonUnauthorized,
} from "@/lib/apiRequestAuth";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { canViewSkillLogRecord, type SkillLogRecord } from "@/lib/skillLogAccess";

const FULL_SELECT = `
  id,
  log_type,
  review_period,
  section,
  tier_auth,
  strengths_observed,
  development_gaps,
  status,
  overall_rating,
  created_at,
  updated_at,
  signed_off_by,
  signed_off_at,
  employee_id,
  supervisor_id,
  employee:users!skill_logs_employee_id_fkey (
    user_id,
    first_name,
    last_name,
    grade_level
  ),
  supervisor:users!skill_logs_supervisor_id_fkey (
    user_id,
    first_name,
    last_name,
    grade_level
  ),
  skill_log_competencies (
    id,
    skill,
    observed,
    performed_under_supervision,
    performed_consistently,
    rating,
    comments
  )
`;

// GET /api/skillLog/get_skillLog
export async function GET(req: NextRequest) {
  try {
    const ctx = await getSkillLogAuthContext(req);
    if (!ctx) return jsonUnauthorized();
    if (
      !canPerformModuleAction(
        ctx.profile,
        "hc:skillLog",
        "view",
        ctx.user.role,
        ctx.presets,
      )
    ) {
      return jsonForbidden();
    }

    const supabaseAdmin = getSupabaseAdminFromAuth();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("skill_logs")
      .select(FULL_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const visible = (data ?? []).filter((log) =>
      canViewSkillLogRecord(
        ctx.profile,
        ctx.user.id,
        log as SkillLogRecord,
        ctx.presets,
        ctx.user.role,
      ),
    );

    return NextResponse.json({ success: true, data: visible });
  } catch (err: unknown) {
    console.error("[GET /api/skillLog/get_skillLog]", err);
    return NextResponse.json(
      { error: "Server error handles processing your logs." },
      { status: 500 },
    );
  }
}
