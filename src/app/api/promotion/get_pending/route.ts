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
    // Promotion eligibility is now fully automated (Appraisal System spec,
    // Section 3): an employee only appears here once their Q4 (Annual)
    // appraisal has final_reviewed and their computed Final Score is
    // >= 70%. There is no manual "ready for promotion" flag anymore.
    const { data: eligibleUsers } = await supabaseAdmin
      .from("users")
      .select("company_id")
      .eq("promotion_eligible", true);

    const eligibleCompanyIds = (eligibleUsers ?? [])
      .map((u) => u.company_id)
      .filter(Boolean);

    if (eligibleCompanyIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Get all appraisal IDs that already have a promotion assessment
    const { data: assessed } = await supabaseAdmin
      .from("promotions")
      .select("appraisal_id");

    const assessedIds = (assessed ?? []).map((p) => p.appraisal_id);

    // The Q4/Annual appraisal that produced the eligibility is what we
    // surface as the "pending assessment" record.
    let query = supabaseAdmin
      .from("appraisals")
      .select(
        `
        id, company_id, employee_name, job_title, current_grade,
        grade_band, cycle, review_quarter, review_year,
        immediate_supervisor, section_authorisations_held,
        promotion_readiness, submitted_by, status, final_quarter_score,
        employee_weighted_score, supervisor_weighted_score,
        employee_ratings, supervisor_ratings, created_at
      `,
      )
      .eq("review_quarter", "Q4")
      .eq("status", "final_reviewed")
      .in("company_id", eligibleCompanyIds)
      .order("created_at", { ascending: false });

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
