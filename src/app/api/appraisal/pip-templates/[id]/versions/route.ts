import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAppraisalGradeTemplateAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import { normalizePipFormSchema } from "@/lib/appraisal/pipFormSchema";
import { PIP_PLACEMENT_COLUMNS } from "@/lib/appraisal/pipTemplates";
import { stringifyPlacementColumns } from "@/lib/organizationalStructureMapping";

/**
 * POST — save a new version of a specific PIP template, either built by
 * hand ("Add section", no source_file_*) or prefilled from an uploaded
 * document's extracted (and possibly HR-tweaked) schema.
 * `publish: true` immediately makes it the active version; `publish:
 * false` saves it as a draft version HR can come back and publish later.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireAppraisalGradeTemplateAccess(req, "add");
  if (!caller) {
    return jsonForbidden("Recruitment add access is required.");
  }
  const { id: templateId } = await params;

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { data: template, error: templateError } = await supabaseAdmin
    .from("pip_form_templates")
    .select("id")
    .eq("id", templateId)
    .maybeSingle();
  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    source_file_url?: string | null;
    source_file_name?: string | null;
    source_cloudinary_public_id?: string | null;
    schema?: unknown;
    publish?: boolean;
  } | null;

  const schema = normalizePipFormSchema(body?.schema);
  if (!schema) {
    return NextResponse.json(
      { error: "A valid, non-empty form schema is required." },
      { status: 400 },
    );
  }

  const { data: latest } = await supabaseAdmin
    .from("pip_form_template_versions")
    .select("version_number")
    .eq("template_id", templateId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersionNumber = (latest?.version_number ?? 0) + 1;
  const shouldPublish = body?.publish === true;
  const now = new Date().toISOString();

  const { data: version, error: versionError } = await supabaseAdmin
    .from("pip_form_template_versions")
    .insert({
      template_id: templateId,
      version_number: nextVersionNumber,
      source_file_url: body?.source_file_url ?? null,
      source_file_name: body?.source_file_name ?? null,
      source_cloudinary_public_id: body?.source_cloudinary_public_id ?? null,
      form_schema: schema,
      extracted_at: body?.source_file_url ? now : null,
      ...(shouldPublish
        ? { published_at: now, published_by: caller.id, published_by_name: caller.name ?? null }
        : {}),
    })
    .select("*")
    .single();

  if (versionError) {
    return NextResponse.json({ error: versionError.message }, { status: 500 });
  }

  let updatedTemplate = null;
  if (shouldPublish) {
    const { data: activated, error: activateError } = await supabaseAdmin
      .from("pip_form_templates")
      .update({ active_version_id: version.id, updated_at: now })
      .eq("id", templateId)
      .select("*")
      .single();
    if (activateError) {
      return NextResponse.json({ error: activateError.message }, { status: 500 });
    }
    updatedTemplate = activated;
  }

  return NextResponse.json({
    data: {
      version,
      template: updatedTemplate
        ? stringifyPlacementColumns(updatedTemplate as Record<string, unknown>, PIP_PLACEMENT_COLUMNS)
        : null,
    },
  }, { status: 201 });
}
