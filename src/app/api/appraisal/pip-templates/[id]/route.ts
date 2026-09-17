import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAppraisalGradeTemplateAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import type { PipFormTemplate, PipFormTemplateVersion } from "@/lib/appraisal/pipTemplates";
import { PIP_PLACEMENT_COLUMNS } from "@/lib/appraisal/pipTemplates";
import { stringifyPlacementColumns } from "@/lib/organizationalStructureMapping";

/** GET — one PIP template plus every version (newest first), for the
 * builder + version history view. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireAppraisalGradeTemplateAccess(req, "view");
  if (!caller) {
    return jsonForbidden("Recruitment view access is required.");
  }
  const { id } = await params;

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { data: template, error } = await supabaseAdmin
    .from("pip_form_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const { data: versions, error: versionsError } = await supabaseAdmin
    .from("pip_form_template_versions")
    .select("*")
    .eq("template_id", id)
    .order("version_number", { ascending: false });

  if (versionsError) {
    return NextResponse.json({ error: versionsError.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      template: stringifyPlacementColumns(
        template as Record<string, unknown>,
        PIP_PLACEMENT_COLUMNS,
      ) as unknown as PipFormTemplate,
      versions: (versions ?? []) as PipFormTemplateVersion[],
    },
  });
}

/** DELETE — remove a template and (cascade) all of its versions. Only
 * meaningful pre-Phase-2, before any live PIP instance can reference a
 * version — same "delete from the list, start over" pattern as the
 * appraisal grade template list. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireAppraisalGradeTemplateAccess(req, "edit");
  if (!caller) {
    return jsonForbidden("Recruitment edit access is required.");
  }
  const { id } = await params;

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { error } = await supabaseAdmin.from("pip_form_templates").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
