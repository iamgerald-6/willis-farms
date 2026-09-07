import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAuth } from "@/lib/apiRequestAuth";
import {
  findGradeTemplateForPlacement,
  resolveTemplateSections,
} from "@/lib/appraisal/gradeTemplates";

/**
 * Resolves the appraisal question set for a specific employee's org
 * placement (their own users.site_id .. grade_level_id) — the replacement
 * for the old grade-band SECTIONS_MAP lookup. Any authenticated user can
 * call this (appraisal filling isn't gated on System Definitions access),
 * same reasoning as /api/appraisal/sections.
 */
export async function GET(req: NextRequest) {
  const caller = await requireAuth(req);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const placement = {
    site_id: searchParams.get("site_id"),
    business_unit_id: searchParams.get("business_unit_id"),
    department_id: searchParams.get("department_id"),
    section_id: searchParams.get("section_id"),
    position_id: searchParams.get("position_id"),
    grade_level_id: searchParams.get("grade_level_id"),
  };

  const template = await findGradeTemplateForPlacement(supabaseAdmin, placement);
  if (!template) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({
    data: {
      id: template.id,
      quarterly: resolveTemplateSections(template, "quarterly") ?? [],
      annual: resolveTemplateSections(template, "annual") ?? [],
    },
  });
}
