import type { SystemOption } from "@/lib/systemDefinitions";
import { getGitFallbackOptions } from "@/lib/systemDefinitions/gitFallback";
import {
  RECRUITMENT_MODULE_ID,
  getDefaultOnboardingFormFields,
  ONBOARDING_DEPARTMENTS_L1L6_LIST,
  ONBOARDING_DEPARTMENTS_L7_LIST,
  ONBOARDING_FIELDS_LIST,
  ONBOARDING_LOCATIONS_LIST,
} from "@/lib/systemDefinitions/onboardingDefaults";
import { COUNTRY_CODES } from "@/lib/careers/phoneCountryCodes";
import type { OnboardingFormData } from "@/lib/careers/onboardingTypes";
import { parseApplicantName } from "@/lib/careers/onboardingTypes";
import type {
  EducationEntry,
  UploadedFile,
  WorkHistoryEntry,
} from "@/lib/careers/applicationFormSchema";
import type { OnboardingQualificationEntry } from "@/lib/careers/onboardingEntryTypes";
import type { OnboardingCertificationEntry } from "@/lib/careers/onboardingEntryTypes";
import type { OnboardingWorkExperienceEntry } from "@/lib/careers/onboardingEntryTypes";
import { isValidEmail, isValidName } from "@/lib/validation";

export type OnboardingFieldStep = "personal" | "medical" | "referee";

export type OnboardingFieldType =
  | "text"
  | "email"
  | "phone"
  | "ghana_card"
  | "ssnit"
  | "date"
  | "select"
  | "textarea"
  | "file"
  | "number"
  | "gps"
  | "bank_account"
  | "qualifications_list"
  | "certifications_list"
  | "work_experience_list"
  | "application_certificates_view"
  | "referee_submissions_view";

/** Plain text fields that hold a person's name (or initials) — letters only. */
const ONBOARDING_NAME_FIELD_KEYS = new Set([
  "personal.surname",
  "personal.first_name",
  "personal.middle_names",
  "emergency.full_name",
  "emergency.relationship",
  "next_of_kin.full_name",
  "payment.account_name",
  "payment.momo_registered_name",
  "payment.bank_name",
  "declarations.signature_name",
  "biosecurity.commitment_initials",
]);

/** Plain text fields that must be digits only. SSNIT has its own dedicated
 * "ssnit" fieldType (see SSNIT_REGEX) rather than living in this set. */
const ONBOARDING_DIGITS_ONLY_FIELD_KEYS = new Set<string>([]);

export function isOnboardingNameFieldKey(fieldKey: string): boolean {
  return ONBOARDING_NAME_FIELD_KEYS.has(fieldKey);
}

export function isOnboardingDigitsOnlyFieldKey(fieldKey: string): boolean {
  return ONBOARDING_DIGITS_ONLY_FIELD_KEYS.has(fieldKey);
}

export interface OnboardingFieldShowWhen {
  field: string;
  equals?: string;
  notEquals?: string;
}

export interface OnboardingFieldRules {
  step: OnboardingFieldStep;
  section?: string;
  fieldKey: string;
  fieldType: OnboardingFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  /** Pull options from a system_options list (e.g. careers.onboardingLocations). */
  optionsRef?: string;
  /** "dynamic:department" resolves L1–L6 vs L7 department lists from grade. */
  optionsRefDynamic?: "department";
  showWhen?: OnboardingFieldShowWhen;
  accept?: string;
  /** half = share a row with the next half-width field in the same section */
  colSpan?: "half" | "full";
  /** Copied from application — candidate cannot edit */
  prefillLocked?: boolean;
}

export interface OnboardingFormField {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  rules: OnboardingFieldRules;
}

export type OnboardingFlatValues = Record<string, unknown>;

export const ONBOARDING_STEP_LABELS: Record<OnboardingFieldStep, string> = {
  personal: "Personal information",
  medical: "Medical & declarations",
  referee: "References & declarations",
};

/** Active candidate-facing steps (legacy `referee` step removed). */
export const ONBOARDING_STEPS: OnboardingFieldStep[] = ["personal", "medical"];

export type OnboardingApplicationContext = {
  application_form_data?: Record<string, unknown> | null;
  full_name?: string;
  email?: string;
  phone?: string;
};

/** Onboarding-only list fields removed from the candidate form. */
const ONBOARDING_FIELDS_NEVER_COLLECTED = new Set([
  "qualifications",
  "application_certificates",
  "additional_certifications",
  "work_experience",
  "referee_submissions",
]);

/** Never shown on onboarding — derived from the job application (e.g. nationality → citizenship). */
const ONBOARDING_FIELDS_NEVER_SHOWN = new Set(["personal.is_citizen"]);

function applicationPrefillValueIsPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    if ("secure_url" in value) {
      return Boolean((value as { secure_url?: string }).secure_url);
    }
    return Object.keys(value as object).length > 0;
  }
  return true;
}

/** Flat values sourced from the job application — used for prefill and hide rules. */
export function buildApplicationBackedOnboardingFlat(
  ctx: OnboardingApplicationContext,
): OnboardingFlatValues {
  const flat = prefillFromApplicationFormData(ctx.application_form_data);

  if (ctx.full_name?.trim()) {
    const name = parseApplicantName(ctx.full_name);
    if (name.first_name) flat["personal.first_name"] = name.first_name;
    if (name.surname) flat["personal.surname"] = name.surname;
    if (name.has_middle_from_application) {
      flat["personal.middle_names"] = name.middle_names;
    }
    flat["declarations.signature_name"] = ctx.full_name.trim();
  }
  if (ctx.email?.trim()) {
    flat["personal.personal_email"] = ctx.email.trim().toLowerCase();
  }
  if (ctx.phone?.trim()) {
    flat["personal.mobile"] = ctx.phone.trim();
  }

  return flat;
}

/** Hide onboarding fields already captured (and prefilled) from the job application. */
export function isOnboardingFieldCoveredByApplication(
  fieldKey: string,
  ctx: OnboardingApplicationContext,
  _currentValues?: OnboardingFlatValues,
): boolean {
  if (ONBOARDING_FIELDS_NEVER_COLLECTED.has(fieldKey)) return true;
  if (ONBOARDING_FIELDS_NEVER_SHOWN.has(fieldKey)) return true;

  const appFlat = buildApplicationBackedOnboardingFlat(ctx);
  const appVal =
    appFlat[fieldKey] ?? getNestedValue(flatToOnboardingForm(appFlat), fieldKey);
  if (applicationPrefillValueIsPresent(appVal)) return true;

  return false;
}

/** Ghana Post GPS: e.g. GA-123-4567 */
export const GPS_ADDRESS_REGEX = /^[A-Z]{2}-\d{3}-\d{4}$/i;

/** Format raw input as Ghana Post GPS: XX-XXX-XXXX. */
export function formatGhanaPostGps(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  let letters = "";
  let digits = "";

  for (const ch of cleaned) {
    if (letters.length < 2 && /[A-Z]/.test(ch)) {
      letters += ch;
    } else if (/\d/.test(ch)) {
      digits += ch;
    }
  }

  digits = digits.slice(0, 7);

  if (!letters) return "";
  if (letters.length < 2) return letters;
  if (!digits) return `${letters}-`;
  if (digits.length <= 3) return `${letters}-${digits}`;
  return `${letters}-${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function isCompleteGhanaPostGps(value: string): boolean {
  return GPS_ADDRESS_REGEX.test(String(value ?? "").trim());
}

/** SSNIT number: 1 letter followed by 12 digits (13 characters total). */
export const SSNIT_REGEX = /^[A-Z]\d{12}$/;

/** Format raw input as a SSNIT number: a leading letter, then up to 12 digits. */
export function formatSsnitNumber(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  let letter = "";
  let digits = "";

  for (const ch of cleaned) {
    if (!letter && /[A-Z]/.test(ch)) {
      letter = ch;
    } else if (/\d/.test(ch) && digits.length < 12) {
      digits += ch;
    }
  }

  return letter + digits;
}

export function isCompleteSsnitNumber(value: string): boolean {
  return SSNIT_REGEX.test(String(value ?? "").trim());
}

/** Ghana bank account numbers are typically 10–16 digits. */
export const BANK_ACCOUNT_REGEX = /^\d{10,16}$/;

export function parseGradeFromRoleTitle(roleTitle: string): string | null {
  const paren = roleTitle.match(/\(L(\d+)\)/i);
  if (paren) return `L${paren[1]}`;
  const bare = roleTitle.match(/\bL(\d+)\b/i);
  return bare ? `L${bare[1]}` : null;
}

export function parseOnboardingFieldRules(
  raw: Record<string, unknown> | null | undefined,
): OnboardingFieldRules {
  const step = raw?.step as OnboardingFieldStep;
  const fieldKey = String(raw?.fieldKey ?? "");
  const fieldType = (raw?.fieldType as OnboardingFieldType) ?? "text";
  const showWhenRaw = raw?.showWhen as OnboardingFieldShowWhen | undefined;

  const normalizedStep: OnboardingFieldStep =
    step === "referee"
      ? "medical"
      : ONBOARDING_STEPS.includes(step)
        ? step
        : "personal";

  return {
    step: normalizedStep,
    section: typeof raw?.section === "string" ? raw.section : undefined,
    fieldKey,
    fieldType,
    required: raw?.required === true,
    placeholder: typeof raw?.placeholder === "string" ? raw.placeholder : undefined,
    options: Array.isArray(raw?.options)
      ? raw.options.map((o) => String(o))
      : undefined,
    optionsRef: typeof raw?.optionsRef === "string" ? raw.optionsRef : undefined,
    optionsRefDynamic:
      raw?.optionsRefDynamic === "department" ? "department" : undefined,
    showWhen:
      showWhenRaw?.field &&
      (showWhenRaw?.equals !== undefined || showWhenRaw?.notEquals !== undefined)
        ? {
            field: String(showWhenRaw.field),
            ...(showWhenRaw.equals !== undefined
              ? { equals: String(showWhenRaw.equals) }
              : {}),
            ...(showWhenRaw.notEquals !== undefined
              ? { notEquals: String(showWhenRaw.notEquals) }
              : {}),
          }
        : undefined,
    accept: typeof raw?.accept === "string" ? raw.accept : undefined,
    colSpan: raw?.colSpan === "half" ? "half" : "full",
    prefillLocked: raw?.prefillLocked === true,
  };
}

export function systemOptionToOnboardingField(option: SystemOption): OnboardingFormField {
  return {
    id: option.id,
    label: option.label,
    sort_order: option.sort_order,
    is_active: option.is_active,
    rules: parseOnboardingFieldRules(option.rules as Record<string, unknown>),
  };
}

/** Legacy single-field rows replaced by list editors — hide even if still in DB. */
export const DEPRECATED_ONBOARDING_FIELD_KEYS = new Set([
  "employment.position_title",
  "employment.department",
  "employment.farm_site",
  "employment.employment_type",
  "qualifications.0.qualification",
  "qualifications.0.institution",
  "work_experience.0.employer",
  "work_experience.0.job_title",
  "skills.relevant_skills",
  "referees.0.full_name",
  "referees.0.relationship",
  "referees.0.phone",
  "referees.0.email",
  "referees.1.full_name",
  "referees.1.relationship",
  "referees.1.phone",
  "referees.1.email",
  "qualifications",
  "application_certificates",
  "additional_certifications",
  "work_experience",
  "referee_submissions",
  /** HR uploads medical proof in Section O — not on the candidate form. */
  "medical.medical_report",
]);

export const DEPRECATED_ONBOARDING_FIELD_IDS = new Set([
  "opt:onboarding:field:position",
  "opt:onboarding:field:department",
  "opt:onboarding:field:location",
  "opt:onboarding:field:emp_type",
  "opt:onboarding:field:qual",
  "opt:onboarding:field:inst",
  "opt:onboarding:field:employer",
  "opt:onboarding:field:job_title",
  "opt:onboarding:field:skills",
  "opt:onboarding:field:ref1_name",
  "opt:onboarding:field:ref1_rel",
  "opt:onboarding:field:ref1_phone",
  "opt:onboarding:field:ref1_email",
  "opt:onboarding:field:ref2_name",
  "opt:onboarding:field:ref2_rel",
  "opt:onboarding:field:ref2_phone",
  "opt:onboarding:field:ref2_email",
  "opt:onboarding:field:quals",
  "opt:onboarding:field:app_certs",
  "opt:onboarding:field:certs",
  "opt:onboarding:field:experience",
  "opt:onboarding:field:ref_view",
  "opt:onboarding:field:med_report",
]);

function isDeprecatedOnboardingField(field: OnboardingFormField): boolean {
  return (
    DEPRECATED_ONBOARDING_FIELD_KEYS.has(field.rules.fieldKey) ||
    DEPRECATED_ONBOARDING_FIELD_IDS.has(field.id)
  );
}

export function normalizeOnboardingFields(
  options: SystemOption[],
): OnboardingFormField[] {
  return options
    .filter((o) => o.is_active && o.rules && typeof o.rules === "object")
    .map(systemOptionToOnboardingField)
    .filter((f) => f.rules.fieldKey && !isDeprecatedOnboardingField(f))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getGitOnboardingFormFields(): OnboardingFormField[] {
  return normalizeOnboardingFields(
    getGitFallbackOptions(RECRUITMENT_MODULE_ID, ONBOARDING_FIELDS_LIST),
  );
}

export function getDefaultOnboardingFormFieldsFallback(): OnboardingFormField[] {
  return normalizeOnboardingFields(getDefaultOnboardingFormFields());
}

/** DB overrides by fieldKey; defaults fill gaps and restore showWhen/options when stripped. */
export function mergeOnboardingFieldDefinitions(
  dbFields: OnboardingFormField[],
): OnboardingFormField[] {
  const defaults = getDefaultOnboardingFormFieldsFallback();
  const map = new Map<string, OnboardingFormField>();

  for (const def of defaults) {
    map.set(def.rules.fieldKey, def);
  }

  for (const db of dbFields) {
    if (!db.is_active || !db.rules.fieldKey || isDeprecatedOnboardingField(db)) continue;
    const def = map.get(db.rules.fieldKey);
    if (!def) {
      map.set(db.rules.fieldKey, db);
      continue;
    }
    map.set(db.rules.fieldKey, {
      ...def,
      ...db,
      label:
        db.rules.fieldKey === "personal.middle_names" ? def.label : db.label,
      rules: {
        ...def.rules,
        ...db.rules,
        showWhen: db.rules.showWhen ?? def.rules.showWhen,
        options:
          db.rules.options && db.rules.options.length > 0
            ? db.rules.options
            : def.rules.options,
        optionsRef: db.rules.optionsRef ?? def.rules.optionsRef,
        optionsRefDynamic:
          db.rules.optionsRefDynamic ?? def.rules.optionsRefDynamic,
        colSpan: def.rules.colSpan ?? db.rules.colSpan,
        section: def.rules.section ?? db.rules.section,
      },
    });
  }

  return [...map.values()]
    .filter((f) => !isDeprecatedOnboardingField(f))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getOnboardingFlatValue(
  values: OnboardingFlatValues,
  path: string,
): string {
  const direct = values[path];
  if (direct !== undefined && direct !== null && String(direct).trim() !== "") {
    return String(direct).trim();
  }
  const nested = getNestedValue(flatToOnboardingForm(values), path);
  if (nested !== undefined && nested !== null && String(nested).trim() !== "") {
    return String(nested).trim();
  }
  return "";
}

function showWhenMatches(
  current: string,
  expected: string | undefined,
): boolean {
  if (expected === undefined) return false;
  return current.toLowerCase() === expected.trim().toLowerCase();
}

export function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setNestedValue<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown,
): T {
  const parts = path.split(".");
  const root = { ...obj } as Record<string, unknown>;
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next =
      cur[key] && typeof cur[key] === "object"
        ? { ...(cur[key] as Record<string, unknown>) }
        : {};
    cur[key] = next;
    cur = next;
  }
  cur[parts[parts.length - 1]] = value;
  return root as T;
}

export function onboardingFormToFlat(form: OnboardingFormData): OnboardingFlatValues {
  const flat: OnboardingFlatValues = {};

  const setPath = (path: string, val: unknown) => {
    flat[path] = val;
  };

  const walk = (obj: unknown, prefix: string) => {
    if (obj == null) {
      if (prefix) setPath(prefix, obj);
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => {
        walk(item, prefix ? `${prefix}.${i}` : String(i));
      });
      return;
    }
    if (typeof obj === "object" && !(obj as UploadedFile).secure_url) {
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (
          val != null &&
          typeof val === "object" &&
          !Array.isArray(val) &&
          !(val as UploadedFile).secure_url
        ) {
          walk(val, path);
        } else if (Array.isArray(val)) {
          walk(val, path);
        } else {
          setPath(path, val);
        }
      }
      return;
    }
    if (prefix) setPath(prefix, obj);
  };

  walk(form, "");
  return flat;
}

export function flatToOnboardingForm(flat: OnboardingFlatValues): OnboardingFormData {
  const form: Record<string, unknown> = {};

  for (const [path, value] of Object.entries(flat)) {
    if (path.startsWith("_meta.")) continue;
    const parts = path.split(".");
    let cur: unknown = form;

    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      const isLast = i === parts.length - 1;
      const nextKey = parts[i + 1];
      const nextIsIndex = nextKey !== undefined && /^\d+$/.test(nextKey);

      if (isLast) {
        if (Array.isArray(cur)) {
          cur[Number(key)] = value;
        } else {
          (cur as Record<string, unknown>)[key] = value;
        }
        continue;
      }

      if (/^\d+$/.test(key)) {
        const idx = Number(key);
        const arr = cur as unknown[];
        if (!arr[idx] || typeof arr[idx] !== "object") {
          arr[idx] = nextIsIndex ? [] : {};
        }
        cur = arr[idx];
      } else {
        const obj = cur as Record<string, unknown>;
        if (!obj[key]) {
          obj[key] = nextIsIndex ? [] : {};
        } else if (nextIsIndex && !Array.isArray(obj[key])) {
          obj[key] = [];
        } else if (!nextIsIndex && typeof obj[key] !== "object") {
          obj[key] = {};
        }
        cur = obj[key];
      }
    }
  }

  return form as OnboardingFormData;
}

export function isOnboardingFieldVisible(
  field: OnboardingFormField,
  values: OnboardingFlatValues,
): boolean {
  const condition = field.rules.showWhen;
  if (!condition) return true;
  const current = getOnboardingFlatValue(values, condition.field);
  if (condition.equals !== undefined) {
    return showWhenMatches(current, condition.equals);
  }
  if (condition.notEquals !== undefined) {
    return current !== "" && !showWhenMatches(current, condition.notEquals);
  }
  return true;
}

export function visibleOnboardingFieldsForStep(
  fields: OnboardingFormField[],
  step: OnboardingFieldStep,
  values: OnboardingFlatValues,
  applicationContext?: OnboardingApplicationContext,
): OnboardingFormField[] {
  return fields
    .filter((f) => f.rules.step === step)
    .filter(
      (f) =>
        !applicationContext ||
        !isOnboardingFieldCoveredByApplication(
          f.rules.fieldKey,
          applicationContext,
          values,
        ),
    )
    .filter((f) => isOnboardingFieldVisible(f, values));
}

export function resolveFieldOptions(
  field: OnboardingFormField,
  values: OnboardingFlatValues,
  optionLists: Record<string, string[]>,
): string[] {
  if (field.rules.optionsRefDynamic === "department") {
    const grade = String(values["_meta.grade_level"] ?? "");
    if (grade === "L7") {
      return optionLists[ONBOARDING_DEPARTMENTS_L7_LIST] ?? [];
    }
    return optionLists[ONBOARDING_DEPARTMENTS_L1L6_LIST] ?? [];
  }
  if (field.rules.optionsRef) {
    return optionLists[field.rules.optionsRef] ?? field.rules.options ?? [];
  }
  return field.rules.options ?? [];
}

function validatePhone(label: string, value: string, errors: string[]) {
  const raw = value.trim();
  const matchedCode = COUNTRY_CODES.filter((c) => raw.startsWith(c.code)).sort(
    (a, b) => b.code.length - a.code.length,
  )[0];
  const digits = matchedCode ? raw.slice(matchedCode.code.length) : "";
  if (!matchedCode || !/^\d{9}$/.test(digits)) {
    errors.push(`${label} needs a country code and exactly 9 digits.`);
  }
}

export function validateOnboardingStep(
  fields: OnboardingFormField[],
  step: OnboardingFieldStep,
  values: OnboardingFlatValues,
  optionLists: Record<string, string[]>,
  applicationContext?: OnboardingApplicationContext,
): string[] {
  const errors: string[] = [];
  const nestedForm = flatToOnboardingForm(values);
  for (const field of visibleOnboardingFieldsForStep(
    fields,
    step,
    values,
    applicationContext,
  )) {
    const value =
      values[field.rules.fieldKey] ??
      getNestedValue(nestedForm, field.rules.fieldKey);

    if (field.rules.fieldType === "file") {
      if (!field.rules.required) continue;
      const fileVal = value as { secure_url?: string } | null | undefined;
      if (!fileVal?.secure_url) {
        errors.push(`${field.label} is required.`);
      }
      continue;
    }

    if (field.rules.fieldType === "application_certificates_view") {
      continue;
    }

    if (field.rules.fieldType === "referee_submissions_view") {
      continue;
    }

    if (field.rules.fieldType === "qualifications_list") {
      if (field.rules.required && !hasValidQualifications(value)) {
        errors.push(
          `${field.label}: add at least one qualification with degree and institution.`,
        );
        continue;
      }
      const entries = Array.isArray(value) ? (value as OnboardingQualificationEntry[]) : [];
      const incomplete = entries.some(
        (entry) =>
          (entry?.qualification?.trim() || entry?.institution?.trim()) &&
          !(entry?.qualification?.trim() && entry?.institution?.trim()),
      );
      if (incomplete) {
        errors.push(
          `${field.label}: each started entry needs both qualification and institution.`,
        );
      }
      continue;
    }

    if (field.rules.fieldType === "certifications_list") {
      if (field.rules.required && !hasValidCertifications(value)) {
        errors.push(
          `${field.label}: add at least one certification with a name and uploaded file.`,
        );
        continue;
      }
      const entries = Array.isArray(value) ? (value as OnboardingCertificationEntry[]) : [];
      const incomplete = entries.some((entry) => {
        const started =
          entry?.name?.trim() ||
          entry?.issuing_body?.trim() ||
          entry?.licence_no?.trim() ||
          entry?.file?.secure_url;
        return started && !(entry?.name?.trim() && entry?.file?.secure_url);
      });
      if (incomplete) {
        errors.push(
          `${field.label}: each additional certification needs a name and uploaded file, or remove the incomplete entry.`,
        );
      }
      continue;
    }

    if (field.rules.fieldType === "work_experience_list") {
      const entries = Array.isArray(value) ? (value as OnboardingWorkExperienceEntry[]) : [];
      const incomplete = entries.some((entry) => {
        const started =
          entry?.employer?.trim() ||
          entry?.job_title?.trim() ||
          entry?.from?.trim() ||
          entry?.to?.trim() ||
          entry?.reason_leaving?.trim();
        return started && !(entry?.employer?.trim() && entry?.job_title?.trim());
      });
      if (incomplete) {
        errors.push(
          `${field.label}: each started entry needs employer and job title, or remove the incomplete entry.`,
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

    if (isEmpty) continue;

    const str = String(value).trim();

    if (field.rules.fieldType === "phone") {
      validatePhone(field.label, str, errors);
    }

    if (field.rules.fieldType === "ghana_card") {
      if (!/^GHA-\d{9}-\d$/.test(str)) {
        errors.push(`${field.label} needs all 10 digits (9 digits + 1 check digit).`);
      }
    }

    if (field.rules.fieldType === "ssnit") {
      if (!isCompleteSsnitNumber(formatSsnitNumber(str))) {
        errors.push(
          `${field.label} must be a valid SSNIT number: 1 letter followed by 12 digits (e.g. P123456789012).`,
        );
      }
      continue;
    }

    if (field.rules.fieldType === "gps") {
      if (!isCompleteGhanaPostGps(formatGhanaPostGps(str))) {
        errors.push(
          `${field.label} must be in Ghana Post GPS format (e.g. GA-123-4567).`,
        );
      }
      continue;
    }

    if (field.rules.fieldType === "bank_account") {
      if (!BANK_ACCOUNT_REGEX.test(str.replace(/\s/g, ""))) {
        errors.push(`${field.label} must be 10–16 digits.`);
      }
    }

    if (
      field.rules.fieldType === "text" &&
      isOnboardingNameFieldKey(field.rules.fieldKey) &&
      !isValidName(str)
    ) {
      errors.push(`${field.label} can only contain letters.`);
    }

    if (
      field.rules.fieldType === "text" &&
      isOnboardingDigitsOnlyFieldKey(field.rules.fieldKey) &&
      !/^\d+$/.test(str)
    ) {
      errors.push(`${field.label} must contain digits only.`);
    }

    if (field.rules.fieldType === "email" && !isValidEmail(str)) {
      errors.push(`${field.label} must be a valid email address.`);
    }

    if (field.rules.fieldType === "select") {
      const opts = resolveFieldOptions(field, values, optionLists);
      if (opts.length > 0 && !opts.includes(str)) {
        errors.push(`${field.label}: please select a valid option.`);
      }
    }
  }
  return errors;
}

const BIOSECURITY_QUESTION_KEYS = [
  "household_pigs",
  "household_pig_work",
  "visited_swine_site_12m",
  "asf_travel_30d",
] as const;

export function validateOnboardingMedicalExtras(form: OnboardingFormData): string[] {
  const errors: string[] = [];
  const bio = form.biosecurity ?? {};

  for (const key of BIOSECURITY_QUESTION_KEYS) {
    const answer = bio[key];
    if (answer !== "yes" && answer !== "no") {
      errors.push("Please answer all biosecurity questions.");
      break;
    }
  }

  if (!bio.commitment_initials?.trim()) {
    errors.push("Biosecurity commitment initials are required.");
  }

  if (!form.declarations?.data_consent) {
    errors.push("Please consent to data processing before submitting.");
  }

  return errors;
}

/** Citizenship from job application — always locked on onboarding. */
export function deriveCitizenshipFromApplication(
  applicationData: Record<string, unknown> | null | undefined,
): "Citizen" | "Non-citizen" | null {
  if (!applicationData) return null;
  const nationality = String(applicationData.nationality ?? "").trim();
  if (nationality) {
    return nationality === "Ghana" ? "Citizen" : "Non-citizen";
  }
  if (applicationData.is_citizen === "Yes") return "Citizen";
  if (applicationData.is_citizen === "No") return "Non-citizen";
  return null;
}

function hasValidQualifications(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return (value as OnboardingQualificationEntry[]).some(
    (entry) => entry?.qualification?.trim() && entry?.institution?.trim(),
  );
}

function hasValidCertifications(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return (value as OnboardingCertificationEntry[]).some(
    (entry) => entry?.name?.trim() && entry?.file?.secure_url,
  );
}

/** Qualifications / certifications from job application (not medical). */
export function prefillQualificationsFromApplication(
  applicationData: Record<string, unknown> | null | undefined,
): OnboardingFlatValues {
  const flat: OnboardingFlatValues = {};
  if (!applicationData) return flat;

  const education = Array.isArray(applicationData.education)
    ? (applicationData.education as EducationEntry[])
    : [];
  const qualifications = education
    .filter((e) => e?.institutionName?.trim())
    .map((e) => ({
      qualification:
        e.degree?.trim() ||
        [e.institutionType, e.institutionName].filter(Boolean).join(" — ") ||
        "",
      institution: e.institutionName.trim(),
      field: e.institutionType?.trim() || "",
      year: e.yearCompleted?.trim() || "",
    }))
    .filter((q) => q.qualification || q.institution);

  if (qualifications.length > 0) {
    flat.qualifications = qualifications;
  }

  const certificateFiles = Array.isArray(applicationData.certificates)
    ? (applicationData.certificates as UploadedFile[])
    : [];
  const applicationCertificates = certificateFiles.filter((f) => f?.secure_url);

  if (applicationCertificates.length > 0) {
    flat.application_certificates = applicationCertificates;
  }

  const workEntries = mapApplicationWorkExperience(applicationData);
  if (workEntries.length > 0) {
    flat.work_experience = workEntries;
  }

  return flat;
}

function purgeFlatIndexedPaths(flat: OnboardingFlatValues, prefix: string): void {
  const needle = `${prefix}.`;
  for (const key of Object.keys(flat)) {
    if (key.startsWith(needle)) delete flat[key];
  }
}

function mapApplicationWorkExperience(
  applicationData: Record<string, unknown>,
): OnboardingWorkExperienceEntry[] {
  const raw = applicationData.work_experience;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      const e = entry as WorkHistoryEntry &
        Partial<OnboardingWorkExperienceEntry> & { employer?: string; job_title?: string };
      const employer = e.company?.trim() || e.employer?.trim() || "";
      const job_title = e.title?.trim() || e.job_title?.trim() || "";
      const from = e.start?.trim() || e.from?.trim() || "";
      const to = e.current ? "Present" : e.end?.trim() || e.to?.trim() || "";
      return {
        employer,
        job_title,
        from,
        to,
        reason_leaving: e.reason_leaving?.trim() || "",
      };
    })
    .filter((e) => e.employer);
}

/** Map job application answers into onboarding flat values. */
export function prefillFromApplicationFormData(
  applicationData: Record<string, unknown> | null | undefined,
): OnboardingFlatValues {
  if (!applicationData) return {};
  const flat: OnboardingFlatValues = {};

  const map: Record<string, string> = {
    first_name: "personal.first_name",
    last_name: "personal.surname",
    email: "personal.personal_email",
    phone: "personal.mobile",
    date_of_birth: "personal.date_of_birth",
    gender: "personal.gender",
    ghana_card_no: "personal.ghana_card_no",
    passport_number: "personal.passport_number",
    passport_bio_page: "personal.passport_bio_page",
  };

  for (const [from, to] of Object.entries(map)) {
    const val = applicationData[from];
    if (applicationPrefillValueIsPresent(val)) {
      flat[to] = val;
    }
  }

  const ghanaCard = applicationData.ghana_card_no ?? applicationData.ghana_card;
  if (
    applicationPrefillValueIsPresent(ghanaCard) &&
    !applicationPrefillValueIsPresent(flat["personal.ghana_card_no"])
  ) {
    flat["personal.ghana_card_no"] = ghanaCard;
  }

  const nationality = String(applicationData.nationality ?? "").trim();
  const citizenship = deriveCitizenshipFromApplication(applicationData);
  if (citizenship) {
    flat["personal.is_citizen"] = citizenship;
  } else if (nationality) {
    flat["personal.is_citizen"] = nationality === "Ghana" ? "Citizen" : "Non-citizen";
  } else if (applicationData.is_citizen) {
    flat["personal.is_citizen"] =
      applicationData.is_citizen === "Yes" ? "Citizen" : "Non-citizen";
  }

  const refs = [
    {
      name: "reference_1_name",
      phone: "reference_1_phone",
      email: "reference_1_email",
      rel: "reference_1_relationship",
    },
    {
      name: "reference_2_name",
      phone: "reference_2_phone",
      email: "reference_2_email",
      rel: "reference_2_relationship",
    },
  ];
  refs.forEach((r, i) => {
    if (applicationData[r.name]) flat[`referees.${i}.full_name`] = applicationData[r.name];
    if (applicationData[r.phone]) flat[`referees.${i}.phone`] = applicationData[r.phone];
    if (applicationData[r.email]) flat[`referees.${i}.email`] = applicationData[r.email];
    if (applicationData[r.rel]) flat[`referees.${i}.relationship`] = applicationData[r.rel];
  });

  Object.assign(flat, prefillQualificationsFromApplication(applicationData));

  return flat;
}

export function applyOnboardingPrefill(
  form: OnboardingFormData,
  opts: {
    full_name: string;
    email: string;
    phone: string;
    role_title: string;
    location?: string | null;
    application_form_data?: Record<string, unknown> | null;
  },
): OnboardingFlatValues {
  const flat = onboardingFormToFlat(form);

  const fromApp = buildApplicationBackedOnboardingFlat({
    application_form_data: opts.application_form_data,
    full_name: opts.full_name,
    email: opts.email,
    phone: opts.phone,
  });
  for (const [k, v] of Object.entries(fromApp)) {
    if (k === "application_certificates" && Array.isArray(v) && v.length > 0) {
      flat.application_certificates = v;
      purgeFlatIndexedPaths(flat, "application_certificates");
      continue;
    }
    if (k === "work_experience" && Array.isArray(v) && v.length > 0) {
      const existing =
        flat.work_experience ??
        getNestedValue(flatToOnboardingForm(flat), "work_experience");
      const existingHasData =
        Array.isArray(existing) &&
        (existing as OnboardingWorkExperienceEntry[]).some((e) => e?.employer?.trim());
      if (!existingHasData) {
        flat.work_experience = v;
        purgeFlatIndexedPaths(flat, "work_experience");
      }
      continue;
    }
    if (Array.isArray(v)) {
      const existing = flat[k];
      const existingEmpty =
        !Array.isArray(existing) ||
        existing.length === 0 ||
        (k === "qualifications" &&
          !(existing as OnboardingQualificationEntry[]).some(
            (e) => e?.qualification?.trim() && e?.institution?.trim(),
          )) ||
        ((k === "certifications" || k === "additional_certifications") &&
          !(existing as { name?: string; file?: { secure_url?: string } }[]).some(
            (e) => e?.name?.trim() && e?.file?.secure_url,
          )) ||
        (k === "application_certificates" &&
          !(existing as { secure_url?: string }[]).some((e) => e?.secure_url)) ||
        (k === "work_experience" &&
          !(existing as { employer?: string }[]).some((e) => e?.employer?.trim()));
      if (existingEmpty) flat[k] = v;
      continue;
    }
    if (flat[k] === undefined || flat[k] === null || String(flat[k]).trim() === "") {
      flat[k] = v;
    }
  }

  const grade = parseGradeFromRoleTitle(opts.role_title);
  if (grade) flat["_meta.grade_level"] = grade;

  return flat;
}

export function optionListLabelsFromOptions(options: SystemOption[]): string[] {
  return options
    .filter((o) => o.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => o.label);
}
