import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();

    const {
      company_id,
      employee_name,
      job_title,
      current_grade,
      section_authorisations_held,
      immediate_supervisor,
      cycle,
      grade_band,
      review_quarter,
      review_year,
      reviewing_manager,
      period_covered,
      promotion_readiness,
      strengths_observed,
      improvement_areas,
      agreed_actions,
      employee_comments,
      most_significant_achievement,
      development_plan_next_year,
      promotion_readiness_assessment,
      compensation_review_input,
      employee_ratings,
      supervisor_ratings,
      employee_weighted_score,
      supervisor_weighted_score,
      submitted_by,
      final_review_date,
    } = body;

    // Validate required fields
    if (
      !company_id ||
      !employee_name ||
      !current_grade ||
      !immediate_supervisor ||
      !cycle ||
      !grade_band ||
      !review_year ||
      !promotion_readiness ||
      (!employee_ratings && !supervisor_ratings)
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Validate cycle
    if (!["quarterly", "annual"].includes(cycle)) {
      return NextResponse.json({ error: "Invalid cycle" }, { status: 400 });
    }

    // Quarterly requires a quarter
    if (cycle === "quarterly" && !review_quarter) {
      return NextResponse.json(
        { error: "Review quarter is required for quarterly appraisals" },
        { status: 400 },
      );
    }

    // Validate grade band
    if (!["L1", "L2_L3", "L4", "L5_L6_L7"].includes(grade_band)) {
      return NextResponse.json(
        { error: "Invalid grade band" },
        { status: 400 },
      );
    }

    // Validate submitted_by — only "employee" or "supervisor" are valid on creation.
    // "both" is only set by the PATCH route when the second party submits.
    const validSubmittedBy = ["employee", "supervisor"];
    if (submitted_by && !validSubmittedBy.includes(submitted_by)) {
      return NextResponse.json(
        {
          error:
            "Invalid submitted_by value. Must be 'employee' or 'supervisor'.",
        },
        { status: 400 },
      );
    }

    // Confirm company_id exists in users table
    const { data: userExists, error: userError } = await supabaseAdmin
      .from("users")
      .select("company_id")
      .eq("company_id", company_id)
      .single();

    if (userError || !userExists) {
      return NextResponse.json(
        { error: "Employee not found with that company ID" },
        { status: 404 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("appraisals")
      .insert([
        {
          company_id,
          employee_name,
          job_title,
          current_grade,
          section_authorisations_held: section_authorisations_held ?? null,
          immediate_supervisor,
          cycle,
          grade_band,
          review_quarter: cycle === "quarterly" ? review_quarter : null,
          review_year,
          reviewing_manager: reviewing_manager ?? null,
          period_covered: period_covered ?? null,
          promotion_readiness,
          strengths_observed: strengths_observed ?? null,
          improvement_areas: improvement_areas ?? null,
          agreed_actions: agreed_actions ?? null,
          employee_comments: employee_comments ?? null,
          most_significant_achievement: most_significant_achievement ?? null,
          development_plan_next_year: development_plan_next_year ?? null,
          promotion_readiness_assessment:
            promotion_readiness_assessment ?? null,
          compensation_review_input: compensation_review_input ?? null,
          status: "draft",
          employee_ratings: employee_ratings ?? null,
          supervisor_ratings: supervisor_ratings ?? null,
          employee_weighted_score: employee_weighted_score ?? null,
          supervisor_weighted_score: supervisor_weighted_score ?? null,
          // "employee" = employee submitted first
          // "supervisor" = supervisor submitted first (less common but valid)
          submitted_by: submitted_by ?? "employee",
          final_review_date: final_review_date ?? null,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
