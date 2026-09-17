import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultMedicalFormSchema } from "./medicalFormDefaults";
import type { MedicalFormSchema, MedicalFormTemplate, MedicalFormTemplateVersion } from "./medicalFormSchema";
import { normalizeMedicalFormSchema } from "./medicalFormSchema";

export async function ensureMedicalFormTemplate(
  supabase: SupabaseClient,
): Promise<MedicalFormTemplate> {
  const { data: existing } = await supabase
    .from("medical_form_templates")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as MedicalFormTemplate;

  const now = new Date().toISOString();
  const schema = getDefaultMedicalFormSchema();

  const { data: template, error: templateError } = await supabase
    .from("medical_form_templates")
    .insert({ name: schema.title, updated_at: now })
    .select("*")
    .single();

  if (templateError || !template) {
    throw new Error(templateError?.message ?? "Failed to create medical form template");
  }

  const { data: version, error: versionError } = await supabase
    .from("medical_form_template_versions")
    .insert({
      template_id: template.id,
      version_number: 1,
      form_schema: schema,
      published_at: now,
      published_by_name: "System",
    })
    .select("*")
    .single();

  if (versionError || !version) {
    throw new Error(versionError?.message ?? "Failed to create default medical form version");
  }

  const { data: updated, error: updateError } = await supabase
    .from("medical_form_templates")
    .update({ active_version_id: version.id, updated_at: now })
    .eq("id", template.id)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? "Failed to activate default medical form version");
  }

  return updated as MedicalFormTemplate;
}

export async function fetchActiveMedicalFormSchema(
  supabase: SupabaseClient,
): Promise<{ template: MedicalFormTemplate; version: MedicalFormTemplateVersion; schema: MedicalFormSchema } | null> {
  const template = await ensureMedicalFormTemplate(supabase);
  if (!template.active_version_id) return null;

  const { data: version } = await supabase
    .from("medical_form_template_versions")
    .select("*")
    .eq("id", template.active_version_id)
    .maybeSingle();

  if (!version) return null;

  const schema = normalizeMedicalFormSchema(version.form_schema) ?? getDefaultMedicalFormSchema();
  return {
    template: template as MedicalFormTemplate,
    version: version as MedicalFormTemplateVersion,
    schema,
  };
}

export async function fetchMedicalFormVersionById(
  supabase: SupabaseClient,
  versionId: string,
): Promise<MedicalFormTemplateVersion | null> {
  const { data } = await supabase
    .from("medical_form_template_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  return (data as MedicalFormTemplateVersion | null) ?? null;
}
