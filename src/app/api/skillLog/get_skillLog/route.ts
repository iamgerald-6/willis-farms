import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize the unrestricted server admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// GET /api/skillLog/get_skillLog
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const isSupervisor = searchParams.get("isSupervisor") === "true";
    // fetchAll=true means the viewer is admin/manager/super_admin or L4+ and
    // should receive every log, not just ones they are directly involved in.
    const fetchAll = searchParams.get("fetchAll") === "true";

    // 2. Base query fetching all logs, related user names/grades, and nested competencies
    let query = supabaseAdmin
      .from("skill_logs")
      .select(
        `
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
      `,
      )
      .order("created_at", { ascending: false });

    // fetchAll: admin / manager / super_admin / L4+ see every log — no filter
    // isSupervisor (L4+): sees logs they filled OR are the employee on
    // everyone else: only their own logs as employee
    if (userId && !fetchAll) {
      if (isSupervisor) {
        query = query.or(`employee_id.eq.${userId},supervisor_id.eq.${userId}`);
      } else {
        query = query.eq("employee_id", userId);
      }
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[GET /api/skillLog/get_skillLog]", err);
    return NextResponse.json(
      { error: "Server error handles processing your logs." },
      { status: 500 },
    );
  }
}
