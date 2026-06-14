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
    // Get all appraisal IDs that already have a promotion assessment
    const { data: assessed } = await supabaseAdmin
      .from("promotions")
      .select("appraisal_id");

    const assessedIds = (assessed ?? []).map((p) => p.appraisal_id);

    // Fetch pending appraisals excluding already assessed ones
    let query = supabaseAdmin
      .from("appraisals")
      .select(
        `
        id, company_id, employee_name, job_title, current_grade,
        grade_band, cycle, review_quarter, review_year,
        immediate_supervisor, section_authorisations_held,
        promotion_readiness, submitted_by,
        employee_weighted_score, supervisor_weighted_score,
        employee_ratings, supervisor_ratings, created_at
      `,
      )
      .eq("submitted_by", "both")
      .eq("promotion_readiness", "ready_for_assessment")
      .order("created_at", { ascending: false });

    // Exclude already assessed appraisals
    if (assessedIds.length > 0) {
      query = query.not("id", "in", `(${assessedIds.join(",")})`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err: any) {
    console.error("[GET /api/promotion/get_pending]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
