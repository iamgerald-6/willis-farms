import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAppraisalGradeTemplateAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import type { PipFormTemplate } from "@/lib/appraisal/pipTemplates";
import { PIP_PLACEMENT_COLUMNS } from "@/lib/appraisal/pipTemplates";
import { stringifyPlacementColumns } from "@/lib/organizationalStructureMapping";

/**
 * Phase 1 of the PIP feature — the template ("origin") layer only (see
 * docs/appraisal/pip-form-templates.sql). Mirrors GET/POST /api/system-
 * definitions/appraisal-grade-templates exactly: one row per exact org
 * combination (Site/Business unit/Department/Section here, vs. that
 * table's six-column chain), found-or-created by the "New template" step
 * of the wizard. What each template actually looks like lives in its
 * versions — see [id]/versions/route.ts.
 */

/** GET — every PIP template, for the "PIP form setup" list view. */
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
    .from("pip_form_templates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: ((data ?? []) as PipFormTemplate[]).map((row) =>
      stringifyPlacementColumns(row as unknown as Record<string, unknown>, PIP_PLACEMENT_COLUMNS),
    ),
  });
}

/**
 * POST — find-or-create by the exact Site/Business unit/Department/
 * Section combination. Picking a combination either opens the existing
 * template for it, or creates a blank one (active_version_id null — no
 * versions yet) to build from with "Add section" and/or "Prefill with
 * WillsOne Intel".
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
  for (const col of PIP_PLACEMENT_COLUMNS) {
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
    .from("pip_form_templates")
    .select("*")
    .match(placement)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      data: stringifyPlacementColumns(existing as Record<string, unknown>, PIP_PLACEMENT_COLUMNS),
    });
  }

  const { data, error } = await supabaseAdmin
    .from("pip_form_templates")
    .insert([{ ...placement }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { data: stringifyPlacementColumns(data as Record<string, unknown>, PIP_PLACEMENT_COLUMNS) },
    { status: 201 },
  );
}
