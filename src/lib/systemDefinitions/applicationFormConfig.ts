import type { ApplicationFormField } from "@/lib/careers/applicationFormSchema";

export type ApplicationFormStepDef = {
  id: string;
  label: string;
  builtIn?: boolean;
  hidden?: boolean;
};

export type ApplicationFormConfig = {
  /** How many referees applicants must provide (default 2). */
  requiredRefereeCount?: number;
  steps?: ApplicationFormStepDef[];
};

export const DEFAULT_REQUIRED_REFEREE_COUNT = 2;
export const MAX_REFEREE_COUNT = 5;

export const BUILTIN_APPLICATION_FORM_STEPS: ApplicationFormStepDef[] = [
  { id: "personal", label: "Personal information", builtIn: true },
  { id: "experience", label: "Experience & qualifications", builtIn: true },
  { id: "documents", label: "Documents", builtIn: true },
  { id: "references", label: "Referees", builtIn: true },
];

export function normalizeApplicationFormConfig(raw: unknown): ApplicationFormConfig {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const countRaw = obj.requiredRefereeCount;
  const requiredRefereeCount =
    typeof countRaw === "number" && Number.isFinite(countRaw)
      ? Math.min(MAX_REFEREE_COUNT, Math.max(1, Math.round(countRaw)))
      : undefined;

  const stepsRaw = obj.steps;
  if (!Array.isArray(stepsRaw)) {
    return requiredRefereeCount != null ? { requiredRefereeCount } : {};
  }

  const steps: ApplicationFormStepDef[] = [];
  const usedIds = new Set<string>();

  for (const item of stepsRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const label = String(row.label ?? "").trim();
    if (!id || !label || usedIds.has(id)) continue;
    usedIds.add(id);
    steps.push({
      id,
      label,
      builtIn: row.builtIn === true,
      hidden: row.hidden === true,
    });
  }

  return {
    ...(requiredRefereeCount != null ? { requiredRefereeCount } : {}),
    ...(steps.length ? { steps } : {}),
  };
}

export function resolveApplicationFormSteps(
  config?: ApplicationFormConfig,
): ApplicationFormStepDef[] {
  const configured = config?.steps?.length ? config.steps : BUILTIN_APPLICATION_FORM_STEPS;
  const byId = new Map<string, ApplicationFormStepDef>();

  for (const builtIn of BUILTIN_APPLICATION_FORM_STEPS) {
    byId.set(builtIn.id, { ...builtIn });
  }
  for (const step of configured) {
    byId.set(step.id, { ...byId.get(step.id), ...step, id: step.id, label: step.label });
  }

  const ordered: ApplicationFormStepDef[] = [];
  const seen = new Set<string>();

  for (const step of configured) {
    const merged = byId.get(step.id);
    if (!merged || seen.has(step.id)) continue;
    seen.add(step.id);
    ordered.push(merged);
  }

  for (const builtIn of BUILTIN_APPLICATION_FORM_STEPS) {
    if (!seen.has(builtIn.id)) {
      ordered.push(byId.get(builtIn.id)!);
    }
  }

  for (const [id, step] of byId.entries()) {
    if (!seen.has(id)) ordered.push(step);
  }

  return ordered.filter((s) => !s.hidden);
}

export function resolveRequiredRefereeCount(config?: ApplicationFormConfig): number {
  return config?.requiredRefereeCount ?? DEFAULT_REQUIRED_REFEREE_COUNT;
}

export function stepLabelFor(
  stepId: string,
  config?: ApplicationFormConfig,
): string {
  const steps = resolveApplicationFormSteps(config);
  return steps.find((s) => s.id === stepId)?.label ?? stepId;
}

export function isRefereeFieldKey(fieldKey: string): boolean {
  return /^reference_\d+_/i.test(fieldKey.trim());
}

/** Labels like "Referee 3 — full name" or "Second referee — phone". */
export function isRefereeLikeLabel(label: string): boolean {
  const text = label.trim();
  if (!text || !/referee/i.test(text)) return false;
  return (
    /reference_\d+_/i.test(text) ||
    /\b(full name|phone|email|relationship)\b/i.test(text) ||
    /\b(first|second|third|\d+(st|nd|rd|th)?)\s+referee\b/i.test(text) ||
    /referee\s*[—–-]/i.test(text)
  );
}

export function isRefereeSystemOption(option: {
  label: string;
  legacy_value?: string | null;
  rules?: unknown;
}): boolean {
  const rules =
    option.rules && typeof option.rules === "object"
      ? (option.rules as Record<string, unknown>)
      : {};
  const fieldKey = String(rules.fieldKey ?? "").trim();
  const legacy = String(option.legacy_value ?? "").trim();

  if (fieldKey === "add_second_referee") return true;
  if (isRefereeFieldKey(fieldKey)) return true;
  if (legacy && isRefereeFieldKey(legacy)) return true;
  return isRefereeLikeLabel(option.label);
}

export const REFEREE_CONTACT_PARTS = [
  "Full name",
  "Phone",
  "Email",
  "Relationship",
] as const;

function refereeOrdinal(n: number): string {
  if (n === 1) return "First";
  if (n === 2) return "Second";
  if (n === 3) return "Third";
  return `Referee ${n}`;
}

export function generateRefereeFormFields(
  count: number,
  stepId = "references",
): ApplicationFormField[] {
  const fields: ApplicationFormField[] = [];
  const suffixes = [
    { key: "name", label: "full name", type: "text" as const },
    { key: "phone", label: "phone", type: "phone" as const },
    { key: "email", label: "email", type: "email" as const },
    { key: "relationship", label: "relationship", type: "text" as const },
  ];

  for (let i = 1; i <= count; i++) {
    for (const s of suffixes) {
      fields.push({
        id: `generated:reference_${i}_${s.key}`,
        label: `${refereeOrdinal(i)} referee — ${s.label}`,
        sort_order: 1000 + i * 10 + suffixes.indexOf(s),
        is_active: true,
        rules: {
          step: stepId,
          fieldKey: `reference_${i}_${s.key}`,
          fieldType: s.type,
          required: true,
        },
      });
    }
  }

  return fields;
}

export function serializeApplicationFormFieldsSnapshot(
  fields: ApplicationFormField[],
  config: ApplicationFormConfig,
): Record<string, unknown> {
  return {
    version: 1,
    saved_at: new Date().toISOString(),
    config: normalizeApplicationFormConfig(config),
    fields,
  };
}

export function parseApplicationFormFieldsSnapshot(raw: unknown): {
  fields: ApplicationFormField[];
  config: ApplicationFormConfig;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const fieldsRaw = obj.fields;
  if (!Array.isArray(fieldsRaw)) return null;

  const fields: ApplicationFormField[] = [];
  for (const item of fieldsRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const rules = row.rules as Record<string, unknown> | undefined;
    const fieldKey = String(rules?.fieldKey ?? "").trim();
    if (!fieldKey) continue;
    fields.push({
      id: String(row.id ?? fieldKey),
      label: String(row.label ?? fieldKey),
      sort_order: Number(row.sort_order ?? 0),
      is_active: row.is_active !== false,
      rules: {
        step: String(rules?.step ?? "personal"),
        fieldKey,
        fieldType: (rules?.fieldType as ApplicationFormField["rules"]["fieldType"]) ?? "text",
        required: rules?.required === true,
        placeholder:
          typeof rules?.placeholder === "string" ? rules.placeholder : undefined,
        options: Array.isArray(rules?.options)
          ? rules.options.map((o) => String(o))
          : undefined,
        showWhen:
          rules?.showWhen && typeof rules.showWhen === "object"
            ? (rules.showWhen as ApplicationFormField["rules"]["showWhen"])
            : undefined,
        accept: typeof rules?.accept === "string" ? rules.accept : undefined,
        multiple: rules?.multiple === true,
        maxLength:
          typeof rules?.maxLength === "number" ? rules.maxLength : undefined,
      },
    });
  }

  if (!fields.length) return null;

  return {
    fields: fields.sort((a, b) => a.sort_order - b.sort_order),
    config: normalizeApplicationFormConfig(obj.config),
  };
}
