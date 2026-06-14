import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("promotions")
      .select(
        `
        id,
        appraisal_id,
        employee_company_id,
        employee_name,
        current_grade,
        current_job_title,
        proposed_grade,
        proposed_job_title,
        immediate_supervisor,
        reviewing_manager,
        triggering_review,
        tier_authorisation,
        section_unit,
        eligibility_checklist,
        assessment_ratings,
        final_decision,
        decision_comments,
        conditions,
        submitted_by_grade,
        created_at,
        updated_at
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err: any) {
    console.error("[GET /api/promotion/get_promotions]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
