import type { SystemOption } from "@/lib/systemDefinitions";
import { getGitFallbackOptions } from "@/lib/systemDefinitions/gitFallback";
import {
  RECRUITMENT_APPLICATION_FIELDS_LIST,
  RECRUITMENT_MODULE_ID,
  getDefaultApplicationFormFields,
} from "@/lib/systemDefinitions/recruitmentDefaults";

export type ApplicationFieldStep = "personal" | "experience" | "documents";

export type ApplicationFieldType =
  | "text"
  | "email"
  | "phone"
  | "date"
  | "select"
  | "textarea"
  | "file";

export interface ApplicationFieldShowWhen {
  field: string;
  equals: string;
}

export interface ApplicationFieldRules {
  step: ApplicationFieldStep;
  fieldKey: string;
  fieldType: ApplicationFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  showWhen?: ApplicationFieldShowWhen;
  accept?: string;
}

export interface ApplicationFormField {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  rules: ApplicationFieldRules;
}

export const APPLICATION_STEP_LABELS: Record<ApplicationFieldStep, string> = {
  personal: "Personal information",
  experience: "Experience & qualifications",
  documents: "Documents & references",
};

export const APPLICATION_STEPS: ApplicationFieldStep[] = [
  "personal",
  "experience",
  "documents",
];

export type ApplicationFormData = Record<string, unknown>;

export function parseApplicationFieldRules(
  raw: Record<string, unknown> | null | undefined,
): ApplicationFieldRules {
  const step = raw?.step as ApplicationFieldStep;
  const fieldKey = String(raw?.fieldKey ?? "");
  const fieldType = (raw?.fieldType as ApplicationFieldType) ?? "text";
  const showWhenRaw = raw?.showWhen as ApplicationFieldShowWhen | undefined;

  return {
    step: APPLICATION_STEPS.includes(step) ? step : "personal",
    fieldKey,
    fieldType,
    required: raw?.required === true,
    placeholder: typeof raw?.placeholder === "string" ? raw.placeholder : undefined,
    options: Array.isArray(raw?.options)
      ? raw.options.map((o) => String(o))
      : undefined,
    showWhen:
      showWhenRaw?.field && showWhenRaw?.equals
        ? { field: String(showWhenRaw.field), equals: String(showWhenRaw.equals) }
        : undefined,
    accept: typeof raw?.accept === "string" ? raw.accept : undefined,
  };
}

export function systemOptionToApplicationField(option: SystemOption): ApplicationFormField {
  return {
    id: option.id,
    label: option.label,
    sort_order: option.sort_order,
    is_active: option.is_active,
    rules: parseApplicationFieldRules(option.rules as Record<string, unknown>),
  };
}

export function normalizeApplicationFields(
  options: SystemOption[],
): ApplicationFormField[] {
  return options
    .filter((o) => o.is_active && o.rules && typeof o.rules === "object")
    .map(systemOptionToApplicationField)
    .filter((f) => f.rules.fieldKey)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getGitApplicationFormFields(): ApplicationFormField[] {
  return normalizeApplicationFields(
    getGitFallbackOptions(RECRUITMENT_MODULE_ID, RECRUITMENT_APPLICATION_FIELDS_LIST),
  );
}

export function getDefaultApplicationFormFieldsFallback(): ApplicationFormField[] {
  return normalizeApplicationFields(getDefaultApplicationFormFields());
}

export function fieldsForStep(
  fields: ApplicationFormField[],
  step: ApplicationFieldStep,
): ApplicationFormField[] {
  return fields.filter((f) => f.rules.step === step);
}

export function isFieldVisible(
  field: ApplicationFormField,
  values: ApplicationFormData,
): boolean {
  const condition = field.rules.showWhen;
  if (!condition) return true;
  const current = values[condition.field];
  return String(current ?? "") === condition.equals;
}

export function visibleFieldsForStep(
  fields: ApplicationFormField[],
  step: ApplicationFieldStep,
  values: ApplicationFormData,
): ApplicationFormField[] {
  return fieldsForStep(fields, step).filter((f) => isFieldVisible(f, values));
}

export function validateStep(
  fields: ApplicationFormField[],
  step: ApplicationFieldStep,
  values: ApplicationFormData,
): string[] {
  const errors: string[] = [];
  for (const field of visibleFieldsForStep(fields, step, values)) {
    if (!field.rules.required) continue;
    const value = values[field.rules.fieldKey];
    if (field.rules.fieldType === "file") {
      const fileVal = value as { secure_url?: string } | null | undefined;
      if (!fileVal?.secure_url) {
        errors.push(`${field.label} is required.`);
      }
      continue;
    }
    if (value === undefined || value === null || String(value).trim() === "") {
      errors.push(`${field.label} is required.`);
    }
  }
  return errors;
}

export function extractApplicantSummary(values: ApplicationFormData): {
  full_name: string;
  email: string;
  phone: string;
  cover_note: string | null;
  cv_url: string | null;
  cv_public_id: string | null;
} {
  const first = String(values.first_name ?? "").trim();
  const last = String(values.last_name ?? "").trim();
  const full_name =
    [first, last].filter(Boolean).join(" ") ||
    String(values.full_name ?? "").trim() ||
    "Applicant";

  const email = String(values.email ?? "").trim().toLowerCase();
  const phone = String(values.phone ?? values.mobile ?? "").trim();

  const cover_note =
    typeof values.cover_letter === "string" && values.cover_letter.trim()
      ? values.cover_letter.trim()
      : null;

  const cv = values.cv as { secure_url?: string; public_id?: string } | undefined;

  return {
    full_name,
    email,
    phone,
    cover_note,
    cv_url: cv?.secure_url ?? null,
    cv_public_id: cv?.public_id ?? null,
  };
}
