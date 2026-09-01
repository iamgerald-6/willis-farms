import type { SystemOption } from "@/lib/systemDefinitions";
import type {
  OnboardingHrFieldGroup,
  OnboardingHrFieldType,
} from "@/lib/systemDefinitions/onboardingHrDefaults";
import { getDefaultOnboardingHrFields } from "@/lib/systemDefinitions/onboardingHrDefaults";

export type OnboardingHrFieldDef = {
  id: string;
  label: string;
  fieldKey: string;
  fieldType: OnboardingHrFieldType;
  group: OnboardingHrFieldGroup;
  required?: boolean;
  hint?: string;
  colSpan?: "half" | "full";
  options?: string[];
  sort_order: number;
  is_active: boolean;
};

export function parseOnboardingHrFieldRules(
  rules: Record<string, unknown> | null | undefined,
): Omit<OnboardingHrFieldDef, "id" | "label" | "sort_order" | "is_active"> {
  const fieldKey = String(rules?.fieldKey ?? "").trim();
  const fieldType = String(rules?.fieldType ?? "text") as OnboardingHrFieldType;
  const group = String(rules?.group ?? "hr") as OnboardingHrFieldGroup;
  const optionsRaw = rules?.options;
  const options = Array.isArray(optionsRaw)
    ? optionsRaw.map((o) => String(o).trim()).filter(Boolean)
    : undefined;

  return {
    fieldKey,
    fieldType,
    group: group === "placement" || group === "notes" ? group : "hr",
    required: rules?.required === true,
    hint: rules?.hint != null ? String(rules.hint) : undefined,
    colSpan: rules?.colSpan === "full" ? "full" : "half",
    options,
  };
}

export function systemOptionToOnboardingHrField(
  option: SystemOption,
): OnboardingHrFieldDef | null {
  const fieldKey = option.legacy_value?.trim() || parseOnboardingHrFieldRules(option.rules as Record<string, unknown>).fieldKey;
  if (!fieldKey) return null;

  const parsed = parseOnboardingHrFieldRules(option.rules as Record<string, unknown>);
  return {
    id: option.id,
    label: option.label,
    sort_order: option.sort_order,
    is_active: option.is_active,
    fieldKey: parsed.fieldKey || fieldKey,
    fieldType: parsed.fieldType,
    group: parsed.group,
    required: parsed.required,
    hint: parsed.hint,
    colSpan: parsed.colSpan,
    options: parsed.options,
  };
}

export function normalizeOnboardingHrFields(
  options: SystemOption[],
): OnboardingHrFieldDef[] {
  return options
    .map(systemOptionToOnboardingHrField)
    .filter((f): f is OnboardingHrFieldDef => f !== null && f.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function resolveOnboardingHrFields(options: SystemOption[]): OnboardingHrFieldDef[] {
  const fromDb = normalizeOnboardingHrFields(options);
  const defaults = normalizeOnboardingHrFields(getDefaultOnboardingHrFields());
  if (fromDb.length === 0) return defaults;

  const byKey = new Map<string, OnboardingHrFieldDef>();
  for (const field of defaults) {
    byKey.set(field.fieldKey, field);
  }
  for (const field of fromDb) {
    byKey.set(field.fieldKey, field);
  }
  return [...byKey.values()].sort((a, b) => a.sort_order - b.sort_order);
}

export const ONBOARDING_HR_FIELD_TYPES: OnboardingHrFieldType[] = [
  "text",
  "date",
  "textarea",
  "select",
  "grade_level",
  "department",
  "employment_type",
  "work_location",
  "supervisor",
  "salary_tier",
  "salary_range",
  "pay_frequency",
];

export const ONBOARDING_HR_FIELD_GROUPS: { value: OnboardingHrFieldGroup; label: string }[] = [
  { value: "placement", label: "Employment placement" },
  { value: "hr", label: "HR fields" },
  { value: "notes", label: "Notes" },
];
