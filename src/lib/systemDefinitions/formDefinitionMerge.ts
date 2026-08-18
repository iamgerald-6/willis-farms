import type { FormDefinition, FormFieldDef } from "@/lib/moduleRegistry/types";
import { appraisalFormDefinition } from "@/lib/moduleRegistry/modules/modAppraisal";
import { skillLogFormDefinition } from "@/lib/moduleRegistry/modules/modSkillLog";

export function getGitAppraisalFormDefinition(): FormDefinition {
  return appraisalFormDefinition;
}

export function mergeFormDefinition(
  git: FormDefinition,
  override?: FormDefinition | null,
): FormDefinition {
  if (!override?.fields?.length) return git;

  const byId = new Map(override.fields.map((f) => [f.id, f]));
  return {
    ...git,
    ...override,
    fields: git.fields.map((field) => {
      const patch = byId.get(field.id);
      if (!patch) return field;
      return { ...field, ...patch, id: field.id, type: field.type };
    }),
  };
}

export function normalizeFormDefinition(raw: unknown): FormDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.fields)) return null;

  const fields: FormFieldDef[] = [];
  for (const item of obj.fields) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const id = String(f.id ?? "").trim();
    const label = String(f.label ?? "").trim();
    const type = f.type as FormFieldDef["type"];
    if (!id || !label || !type) continue;
    fields.push({
      id,
      label,
      type,
      required: f.required === true,
      requiredWhen:
        f.requiredWhen != null ? String(f.requiredWhen) : undefined,
      optionsRef:
        f.optionsRef != null ? String(f.optionsRef) : undefined,
      helpText: f.helpText != null ? String(f.helpText) : undefined,
    });
  }

  return fields.length ? { fields } : null;
}

export function formDefinitionForModule(
  moduleId: string,
): FormDefinition | null {
  if (moduleId === "mod:appraisal") return getGitAppraisalFormDefinition();
  if (moduleId === "mod:skill-log") return skillLogFormDefinition;
  return null;
}
