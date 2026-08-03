import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    const cycle = searchParams.get("cycle");
    const grade_band = searchParams.get("grade_band");
    const review_year = searchParams.get("review_year");
    const review_quarter = searchParams.get("review_quarter");
    const status = searchParams.get("status");

    let query = supabaseAdmin
      .from("appraisals")
      .select("*")
      .order("created_at", { ascending: false });

    if (company_id) query = query.eq("company_id", company_id);
    if (cycle) query = query.eq("cycle", cycle);
    if (grade_band) query = query.eq("grade_band", grade_band);
    if (review_year) query = query.eq("review_year", Number(review_year));
    if (review_quarter) query = query.eq("review_quarter", review_quarter);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
