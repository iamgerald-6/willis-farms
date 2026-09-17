import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireRecruitmentAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import { ensureMedicalFormTemplate } from "@/lib/medical/medicalTemplates";
import { normalizeMedicalFormSchema } from "@/lib/medical/medicalFormSchema";

/** POST — save a new medical form template version; optionally publish. */
export async function POST(req: NextRequest) {
  const caller = await requireRecruitmentAccess(req, "edit");
  if (!caller) return jsonForbidden("Recruitment edit access is required.");

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as {
    schema?: unknown;
    publish?: boolean;
    source_file_url?: string | null;
    source_file_name?: string | null;
    source_cloudinary_public_id?: string | null;
  } | null;

  const schema = normalizeMedicalFormSchema(body?.schema);
  if (!schema) {
    return NextResponse.json({ error: "A valid form schema is required." }, { status: 400 });
  }

  const template = await ensureMedicalFormTemplate(supabaseAdmin);

  const { data: latest } = await supabaseAdmin
    .from("medical_form_template_versions")
    .select("version_number")
    .eq("template_id", template.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersionNumber = (latest?.version_number ?? 0) + 1;
  const shouldPublish = body?.publish === true;
  const now = new Date().toISOString();

  const { data: version, error: versionError } = await supabaseAdmin
    .from("medical_form_template_versions")
    .insert({
      template_id: template.id,
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

  if (shouldPublish) {
    await supabaseAdmin
      .from("medical_form_templates")
      .update({ active_version_id: version.id, updated_at: now })
      .eq("id", template.id);
  }

  return NextResponse.json({ data: version });
}
