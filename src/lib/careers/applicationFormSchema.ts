import type { SystemOption } from "@/lib/systemDefinitions";
import { getGitFallbackOptions } from "@/lib/systemDefinitions/gitFallback";
import {
  RECRUITMENT_APPLICATION_FIELDS_LIST,
  RECRUITMENT_MODULE_ID,
  getDefaultApplicationFormFields,
} from "@/lib/systemDefinitions/recruitmentDefaults";
import { COUNTRY_CODES } from "@/lib/careers/phoneCountryCodes";

export type ApplicationFieldStep = "personal" | "experience" | "documents";

export type ApplicationFieldType =
  | "text"
  | "email"
  | "phone"
  | "ghana_card"
  | "date"
  | "select"
  | "textarea"
  | "file"
  | "work_history"
  | "education_history";

export interface WorkHistoryEntry {
  company: string;
  title: string;
  start: string; // "YYYY-MM"
  end: string; // "YYYY-MM", ignored when current is true
  current: boolean;
}

export interface EducationEntry {
  institutionType: string; // University, High School, College, Diploma, Other
  institutionName: string;
  yearStarted: string; // "YYYY"
  yearCompleted: string; // "YYYY"
  degree: string; // optional — degree/qualification obtained, if applicable
}

export interface ApplicationFieldShowWhen {
  field: string;
  equals?: string;
  notEquals?: string;
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
      showWhenRaw?.field && (showWhenRaw?.equals !== undefined || showWhenRaw?.notEquals !== undefined)
        ? {
            field: String(showWhenRaw.field),
            ...(showWhenRaw.equals !== undefined ? { equals: String(showWhenRaw.equals) } : {}),
            ...(showWhenRaw.notEquals !== undefined
              ? { notEquals: String(showWhenRaw.notEquals) }
              : {}),
          }
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
  const current = String(values[condition.field] ?? "");
  if (condition.equals !== undefined) return current === condition.equals;
  if (condition.notEquals !== undefined) {
    // Don't reveal a "not this" field before the controlling field has
    // even been answered — e.g. passport fields shouldn't appear just
    // because nationality is still blank (which is trivially "not Ghana").
    return current !== "" && current !== condition.notEquals;
  }
  return true;
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
    const value = values[field.rules.fieldKey];

    if (field.rules.fieldType === "file") {
      if (!field.rules.required) continue;
      const fileVal = value as { secure_url?: string } | null | undefined;
      if (!fileVal?.secure_url) {
        errors.push(`${field.label} is required.`);
      }
      continue;
    }

    // Work history stores an array of entries (see WorkHistoryInput) rather
    // than a single value — validated entry-by-entry instead of via the
    // generic isEmpty check below.
    if (field.rules.fieldType === "work_history") {
      const entries = Array.isArray(value) ? (value as WorkHistoryEntry[]) : [];
      if (field.rules.required && entries.length === 0) {
        errors.push(`${field.label} is required — add at least one entry.`);
        continue;
      }
      const hasIncompleteEntry = entries.some((entry) => {
        const missingCore =
          !entry?.company?.trim() || !entry?.title?.trim() || !entry?.start?.trim();
        const missingEnd = !entry?.current && !entry?.end?.trim();
        return missingCore || missingEnd;
      });
      if (hasIncompleteEntry) {
        errors.push(
          `${field.label}: fill in the place of work, job title, and dates for every entry (or remove the incomplete one).`,
        );
      }
      continue;
    }

    // Education history stores an array of entries (see
    // EducationHistoryInput) — degree is optional (not every institution
    // type has one), everything else is required per entry.
    if (field.rules.fieldType === "education_history") {
      const entries = Array.isArray(value) ? (value as EducationEntry[]) : [];
      if (field.rules.required && entries.length === 0) {
        errors.push(`${field.label} is required — add at least one entry.`);
        continue;
      }
      const hasIncompleteEntry = entries.some(
        (entry) =>
          !entry?.institutionType?.trim() ||
          !entry?.institutionName?.trim() ||
          !entry?.yearStarted?.trim() ||
          !entry?.yearCompleted?.trim(),
      );
      if (hasIncompleteEntry) {
        errors.push(
          `${field.label}: fill in the institution type, name, and years for every entry (or remove the incomplete one).`,
        );
      }
      continue;
    }

    const isEmpty =
      value === undefined || value === null || String(value).trim() === "";

    if (field.rules.required && isEmpty) {
      errors.push(`${field.label} is required.`);
      continue;
    }

    // Phone fields store "<country code><9 digits>" as one string (see
    // PhoneNumberInput) — checked here, not just presence, whenever a
    // value has been entered (even for an optional field like a second
    // reference's phone), so a half-typed number can't slip through.
    if (field.rules.fieldType === "phone" && !isEmpty) {
      const raw = String(value).trim();
      // Longest matching code wins (see PhoneNumberInput.tsx) — e.g.
      // "+1684..." must match American Samoa, not the shorter "+1"
      // (Canada/United States) that's also a valid prefix of it.
      const matchedCode = COUNTRY_CODES.filter((c) => raw.startsWith(c.code)).sort(
        (a, b) => b.code.length - a.code.length,
      )[0];
      const digits = matchedCode ? raw.slice(matchedCode.code.length) : "";
      if (!matchedCode || !/^\d{9}$/.test(digits)) {
        errors.push(`${field.label} needs a country code and exactly 9 digits.`);
      }
    }

    // Ghana Card stores "GHA-XXXXXXXXX-X" as one string (see
    // GhanaCardInput) — 9 digits, a dash, then the 1-digit check digit.
    if (field.rules.fieldType === "ghana_card" && !isEmpty) {
      if (!/^GHA-\d{9}-\d$/.test(String(value).trim())) {
        errors.push(`${field.label} needs all 10 digits (9 digits + 1 check digit).`);
      }
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
