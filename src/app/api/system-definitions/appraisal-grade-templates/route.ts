import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAppraisalGradeTemplateAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import type { AppraisalGradeTemplate } from "@/lib/appraisal/gradeTemplates";
import { stringifyPlacementColumns } from "@/lib/organizationalStructureMapping";

const PLACEMENT_COLUMNS = [
  "site_id",
  "business_unit_id",
  "department_id",
  "section_id",
  "position_id",
  "grade_level_id",
] as const;

/** GET — every template, for the list view in Appraisal scope. */
export async function GET(req: NextRequest) {
  const caller = await requireAppraisalGradeTemplateAccess(req, "view");
  if (!caller) {
    return jsonForbidden("Recruitment view access is required.");
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("appraisal_grade_templates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: ((data ?? []) as AppraisalGradeTemplate[]).map((row) =>
      stringifyPlacementColumns(row as unknown as Record<string, unknown>),
    ),
  });
}

/**
 * POST — find-or-create by the exact 6-column combination. Used by step 1
 * of the wizard: picking a combination either opens the existing template
 * for it, or creates a blank one (empty quarterly/annual sections, no
 * extra rules) to build from.
 */
export async function POST(req: NextRequest) {
  const caller = await requireAppraisalGradeTemplateAccess(req, "add");
  if (!caller) {
    return jsonForbidden("Recruitment add access is required.");
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const body = await req.json();
  const placement: Record<string, string> = {};
  for (const col of PLACEMENT_COLUMNS) {
    const value = typeof body[col] === "string" ? body[col].trim() : "";
    if (!value) {
      return NextResponse.json(
        { error: `${col} is required — pick a value for every field.` },
        { status: 400 },
      );
    }
    placement[col] = value;
  }

  const { data: existing } = await supabaseAdmin
    .from("appraisal_grade_templates")
    .select("*")
    .match(placement)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ data: stringifyPlacementColumns(existing as Record<string, unknown>) });
  }

  const { data, error } = await supabaseAdmin
    .from("appraisal_grade_templates")
    .insert([
      {
        ...placement,
        quarterly_sections: [],
        annual_sections: [],
        extra_rules: [],
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: stringifyPlacementColumns(data as Record<string, unknown>) }, { status: 201 });
}
