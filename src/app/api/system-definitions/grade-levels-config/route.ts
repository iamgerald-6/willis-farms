import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonUnauthorized,
  requireAuth,
} from "@/lib/apiRequestAuth";
import { fetchGradeLevelsConfig } from "@/lib/grades/fetchGradeLevelsConfig";

/**
 * Grade levels config, sourced live from the Organizational Structure
 * "Grade levels" catalog (grade_levels table) — see
 * docs/organizational-structure/grade-levels-catalog-fields.sql. Any
 * authenticated user can read this; it's consumed across Appraisal, Skill
 * Log, Promotion, and Recruitment to resolve grade order, consultant
 * status, and age bands.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const data = await fetchGradeLevelsConfig(supabase);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
