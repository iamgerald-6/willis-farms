import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  jsonUnauthorized,
  requireSkillLogAccess,
} from "@/lib/apiRequestAuth";
import {
  canFillSkillLog,
  canFillSkillLogForEmployee,
  flattenSkillLogGradeLevels,
  type SkillLogRecord,
} from "@/lib/skillLogAccess";
import { isConsultantGrade } from "@/lib/systemDefinitions/gradeLevelsConfig";

export async function POST(req: NextRequest) {
  const ctx = await requireSkillLogAccess(req, "add");
  if (!ctx) {
    const authed = await requireSkillLogAccess(req);
    return authed ? jsonForbidden() : jsonUnauthorized();
  }

  if (
    !canFillSkillLog(ctx.profile, ctx.presets, ctx.user.role)
  ) {
    return jsonForbidden(
      "Only Supervisory Role, Human Resource, Executive Role, or Super Admin with fill permission can create skill logs",
    );
  }

  const supabaseAdmin = getSupabaseAdminFromAuth();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { success: false, message: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const {
      employee_id,
      log_type,
      review_period,
      section,
      tier_auth,
      strengths_observed,
      development_gaps,
      status = "draft",
      competencies = [],
    } = body;

    const supervisor_id = ctx.user.id;

    if (!employee_id || !log_type || !review_period) {
      return NextResponse.json(
        {
          success: false,
          message:
            "employee_id, log_type, and review_period are required",
        },
        { status: 400 },
      );
    }

    // grade_level is no longer a stored column — derived live via the
    // grade_level_id FK join to the Grade levels catalog.
    const { data: employeeProfileRow } = await supabaseAdmin
      .from("users")
      .select("user_id, grade_level_id, grade_levels(code), supervisor_id")
      .eq("user_id", employee_id)
      .maybeSingle();

    if (!employeeProfileRow) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 },
      );
    }

    const employeeProfileGradeLevels = (
      employeeProfileRow as typeof employeeProfileRow & {
        grade_levels?: { code: string | null } | null;
      }
    ).grade_levels;
    const employeeProfile = {
      ...employeeProfileRow,
      grade_level: employeeProfileGradeLevels?.code ?? null,
    };

    if (isConsultantGrade(employeeProfile.grade_level)) {
      return NextResponse.json(
        {
          success: false,
          message: "Consultants are not on the skill log program.",
        },
        { status: 403 },
      );
    }

    if (!canFillSkillLogForEmployee(supervisor_id, employeeProfile)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You can only fill skill logs for employees assigned to you as their supervisor in User Management.",
        },
        { status: 403 },
      );
    }

    const ratings = competencies
      .map((c: { rating?: number | null }) => c.rating)
      .filter(
        (r: number | null | undefined) =>
          r !== null && r !== undefined && !isNaN(r),
      );
    const overall_rating =
      ratings.length > 0
        ? Math.round(
            (ratings.reduce((a: number, b: number) => a + b, 0) /
              ratings.length) *
              10,
          ) / 10
        : null;

    const { data: logData, error: logError } = await supabaseAdmin
      .from("skill_logs")
      .insert({
        employee_id,
        supervisor_id,
        log_type,
        review_period,
        section: section ?? null,
        tier_auth: tier_auth ?? null,
        strengths_observed: strengths_observed ?? null,
        development_gaps: development_gaps ?? null,
        status,
        overall_rating,
      })
      .select()
      .single();

    if (logError) throw logError;

    if (competencies.length > 0) {
      const rows = competencies.map(
        (c: {
          skill: string;
          observed?: string | null;
          performed_under_supervision?: string | null;
          performed_consistently?: string | null;
          rating?: number | null;
          comments?: string | null;
        }) => ({
          skill_log_id: logData.id,
          skill: c.skill,
          observed: c.observed || null,
          performed_under_supervision: c.performed_under_supervision || null,
          performed_consistently: c.performed_consistently || null,
          rating: c.rating ?? null,
          comments: c.comments ?? null,
        }),
      );

      const { error: compError } = await supabaseAdmin
        .from("skill_log_competencies")
        .insert(rows);

      if (compError) throw compError;
    }

    const { data: fullLog } = await supabaseAdmin
      .from("skill_logs")
      .select(
        `
        *,
        employee:users!skill_logs_employee_id_fkey (user_id, first_name, last_name, grade_level_id, grade_levels(code)),
        supervisor:users!skill_logs_supervisor_id_fkey (user_id, first_name, last_name, grade_level_id, grade_levels(code)),
        skill_log_competencies (*)
      `,
      )
      .eq("id", logData.id)
      .single();

    return NextResponse.json(
      {
        success: true,
        data: fullLog ? flattenSkillLogGradeLevels(fullLog as SkillLogRecord) : fullLog,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error("[POST /api/skillLog/create_skillLog]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json(
      { success: false, message },
      { status: 500 },
    );
  }
}
