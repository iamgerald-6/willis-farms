import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { success: false, message: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const {
      supervisor_id, // ← passed from frontend
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

    if (!supervisor_id || !employee_id || !log_type || !review_period) {
      return NextResponse.json(
        {
          success: false,
          message:
            "supervisor_id, employee_id, log_type, and review_period are required",
        },
        { status: 400 },
      );
    }

    // Verify supervisor grade
    const { data: supervisorProfile } = await supabaseAdmin
      .from("users")
      .select("grade_level")
      .eq("user_id", supervisor_id)
      .maybeSingle();

    if (!supervisorProfile) {
      return NextResponse.json(
        { success: false, message: "Supervisor not found" },
        { status: 404 },
      );
    }

    const supervisorGrade =
      parseInt(supervisorProfile.grade_level.replace(/\D/g, ""), 10) || 0;
    if (supervisorGrade < 3) {
      return NextResponse.json(
        { success: false, message: "Only L3+ supervisors can fill skill logs" },
        { status: 403 },
      );
    }

    // Verify employee exists and is below supervisor grade
    const { data: employeeProfile } = await supabaseAdmin
      .from("users")
      .select("user_id, grade_level")
      .eq("user_id", employee_id)
      .maybeSingle();

    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 },
      );
    }

    const employeeGrade =
      parseInt(employeeProfile.grade_level.replace(/\D/g, ""), 10) || 0;
    if (employeeGrade >= supervisorGrade) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You can only assess employees with a lower grade than yours",
        },
        { status: 403 },
      );
    }

    // Calculate overall_rating
    const ratings = competencies
      .map((c: any) => c.rating)
      .filter((r: any) => r !== null && r !== undefined && !isNaN(r));
    const overall_rating =
      ratings.length > 0
        ? Math.round(
            (ratings.reduce((a: number, b: number) => a + b, 0) /
              ratings.length) *
              10,
          ) / 10
        : null;

    // Insert skill log
    const { data: logData, error: logError } = await supabaseAdmin
      .from("skill_logs")
      .insert({
        employee_id,
        supervisor_id, // ← from body, not from token
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

    // Insert competencies
    if (competencies.length > 0) {
      const rows = competencies.map((c: any) => ({
        skill_log_id: logData.id,
        skill: c.skill,
        observed: c.observed || null,
        performed_under_supervision: c.performed_under_supervision || null,
        performed_consistently: c.performed_consistently || null,
        rating: c.rating ?? null,
        comments: c.comments ?? null,
      }));

      const { error: compError } = await supabaseAdmin
        .from("skill_log_competencies")
        .insert(rows);

      if (compError) throw compError;
    }

    // Return full log
    const { data: fullLog } = await supabaseAdmin
      .from("skill_logs")
      .select(
        `
        *,
        employee:users!skill_logs_employee_id_fkey (user_id, first_name, last_name, grade_level),
        supervisor:users!skill_logs_supervisor_id_fkey (user_id, first_name, last_name, grade_level),
        skill_log_competencies (*)
      `,
      )
      .eq("id", logData.id)
      .single();

    return NextResponse.json({ success: true, data: fullLog }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/skillLog/create_skillLog]", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 },
    );
  }
}
