import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  getSkillLogAuthContext,
  jsonForbidden,
  jsonUnauthorized,
} from "@/lib/apiRequestAuth";
import {
  canAccessSkillLogList,
  canViewSkillLogRecord,
  flattenSkillLogGradeLevels,
  type SkillLogRecord,
} from "@/lib/skillLogAccess";
import { siteFilterValue } from "@/lib/siteAccess";

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
  site_id,
  employee:users!skill_logs_employee_id_fkey (
    user_id,
    first_name,
    last_name,
    grade_level_id,
    grade_levels ( code )
  ),
  supervisor:users!skill_logs_supervisor_id_fkey (
    user_id,
    first_name,
    last_name,
    grade_level_id,
    grade_levels ( code )
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
    if (!canAccessSkillLogList(ctx.profile, ctx.user.role, ctx.presets)) {
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

    // skill_logs.site_id is a creation-time snapshot (see
    // docs/multi-site/add-site-id-historical-tables.sql). An employee always
    // sees their own skill log entries regardless of site — same "own
    // records" exception used across leave/appraisals; anyone viewing
    // someone else's record is still site-locked unless at headquarters.
    const siteId = siteFilterValue(ctx.user);
    const visible = (data ?? [])
      .filter((log) =>
        canViewSkillLogRecord(
          ctx.profile,
          ctx.user.id,
          log as SkillLogRecord,
          ctx.presets,
          ctx.user.role,
        ),
      )
      .filter((log) => {
        const rec = log as unknown as { employee_id?: string | null; site_id?: number | null };
        if (rec.employee_id === ctx.user.id) return true;
        if (siteId == null) return true;
        return rec.site_id === siteId;
      })
      .map((log) => flattenSkillLogGradeLevels(log as SkillLogRecord));

    return NextResponse.json({ success: true, data: visible });
  } catch (err: unknown) {
    console.error("[GET /api/skillLog/get_skillLog]", err);
    return NextResponse.json(
      { error: "Server error handles processing your logs." },
      { status: 500 },
    );
  }
}
