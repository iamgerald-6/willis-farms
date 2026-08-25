import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { isSupervisorRank } from "@/lib/systemDefinitions/gradeLevelsConfig";
import { fetchGradeLevelsConfig } from "@/lib/grades/fetchGradeLevelsConfig";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }
  try {
    const body = await req.json();

    const {
      appraisal_id,
      company_id,
      employee_name,
      current_grade,
      current_job_title,
      proposed_job_title,
      proposed_grade,
      immediate_supervisor,
      reviewing_manager,
      tier_authorisation,
      section_unit,
      triggering_review,
      promotion_step,
      time_in_current_role,
      business_need_confirmed,
      eligibility_checklist,
      assessment_ratings,
      form_data,
      final_decision,
      decision_comments,
      conditions,
      submitted_by_user_id,
      submitted_by_grade,
    } = body;

    if (
      !appraisal_id ||
      !company_id ||
      !employee_name ||
      !current_grade ||
      !final_decision
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: appraisal_id, company_id, employee_name, current_grade, final_decision",
        },
        { status: 400 },
      );
    }

    if (submitted_by_user_id) {
      const { data: submitter } = await supabase
        .from("users")
        .select("company_id")
        .eq("user_id", submitted_by_user_id)
        .maybeSingle();

      if (submitter && submitter.company_id === company_id) {
        return NextResponse.json(
          { error: "You cannot submit a promotion assessment for yourself." },
          { status: 403 },
        );
      }
    }

    const gradeConfig = await fetchGradeLevelsConfig(supabase);
    if (!isSupervisorRank(submitted_by_grade, gradeConfig)) {
      return NextResponse.json(
        {
          error:
            "Only staff at grade L4 and above can submit promotion assessments.",
        },
        { status: 403 },
      );
    }

    const insertPayload: Record<string, unknown> = {
      appraisal_id,
      employee_company_id: company_id,
      employee_name,
      current_grade,
      current_job_title: current_job_title ?? null,
      proposed_job_title: proposed_job_title ?? null,
      proposed_grade: proposed_grade ?? null,
      immediate_supervisor: immediate_supervisor ?? null,
      reviewing_manager: reviewing_manager ?? null,
      tier_authorisation: tier_authorisation ?? null,
      section_unit: section_unit ?? null,
      triggering_review: triggering_review ?? null,
      eligibility_checklist: eligibility_checklist ?? {},
      assessment_ratings: assessment_ratings ?? {},
      final_decision,
      decision_comments: decision_comments ?? null,
      conditions: conditions ?? null,
      submitted_by_user_id: submitted_by_user_id ?? null,
      submitted_by_grade: submitted_by_grade ?? null,
    };

    if (promotion_step != null) insertPayload.promotion_step = promotion_step;
    if (time_in_current_role != null)
      insertPayload.time_in_current_role = time_in_current_role;
    if (business_need_confirmed != null)
      insertPayload.business_need_confirmed = business_need_confirmed;
    if (form_data != null) insertPayload.form_data = form_data;

    const { data, error } = await supabase
      .from("promotions")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: unknown) {
    console.error("[POST /api/promotion/post_promotions]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
