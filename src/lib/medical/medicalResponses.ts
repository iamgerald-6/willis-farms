import type { MedicalFormSchema, MedicalFormResponses } from "./medicalFormSchema";
import {
  calculateBmi,
  HEARING_FAIL_NOTE_KEYS,
  VISUAL_ACUITY_FAIL_NOTE_KEYS,
} from "./medicalClinicalVitals";
import { emptyInvestigationsData } from "./medicalInvestigationDefs";
import {
  CLINICAL_SYSTEM_ROWS,
  MEDICAL_HISTORY_ITEMS,
} from "./medicalFormDefaults";

function seedTableRows(
  labels: string[],
  labelKey: string,
): Array<Record<string, string | null>> {
  return labels.map((label) => ({
    [labelKey]: label,
  }));
}

/** Migrate legacy Part 4 table rows and lab report uploads into current shape. */
export function ensureInvestigationsData(responses: MedicalFormResponses): MedicalFormResponses {
  let next = responses;

  if (!next.investigations) {
    const legacyRows = next.tables?.investigations;
    next = {
      ...next,
      investigations: legacyRows?.length ? emptyInvestigationsData() : emptyInvestigationsData(),
    };
  }

  const legacyReports = next.investigations?.lab_reports ?? [];
  if (legacyReports.length > 0) {
    const existingUrls = new Set((next.attachments ?? []).map((a) => a.secure_url));
    const migrated = legacyReports.filter((r) => !existingUrls.has(r.secure_url));
    if (migrated.length > 0) {
      next = {
        ...next,
        attachments: [...(next.attachments ?? []), ...migrated],
        investigations: { ...next.investigations!, lab_reports: [] },
      };
    }
  }

  if (!next.attachments) {
    next = { ...next, attachments: [] };
  }

  return next;
}

/** Pre-fill fixed-row tables; init investigations object. */
export function buildInitialMedicalResponses(schema: MedicalFormSchema): MedicalFormResponses {
  const tables: MedicalFormResponses["tables"] = {};

  for (const section of schema.sections) {
    if (section.kind !== "table") continue;
    const customRows = (section as { tableRowLabels?: string[] }).tableRowLabels;
    if (section.key === "medical_history") {
      const labels =
        Array.isArray(customRows) && customRows.length > 0
          ? customRows
          : MEDICAL_HISTORY_ITEMS;
      tables[section.key] = seedTableRows(labels, "item");
    } else if (section.key === "clinical_systems") {
      const labels =
        Array.isArray(customRows) && customRows.length > 0
          ? customRows
          : CLINICAL_SYSTEM_ROWS;
      tables[section.key] = seedTableRows(labels, "system");
    } else {
      tables[section.key] = Array.from({ length: section.minRows || 1 }, () =>
        Object.fromEntries(section.columns.map((col) => [col.key, ""])),
      );
    }
  }

  return { fields: {}, tables, investigations: emptyInvestigationsData(), attachments: [] };
}

/** Prefill Part 6 fields from referral (Part 1) when not already set. */
export function withMedicalReferralPrefills(
  responses: MedicalFormResponses,
  referral: { designated_facility?: string },
): MedicalFormResponses {
  const fields = { ...(responses.fields ?? {}) };
  const facility = referral.designated_facility?.trim();
  if (facility && !fields.facility_name?.toString().trim()) {
    fields.facility_name = facility;
  }
  return { ...responses, fields };
}

/** Sync computed BMI into field responses when height/weight present. */
export function withComputedBmi(responses: MedicalFormResponses): MedicalFormResponses {
  const fields = { ...(responses.fields ?? {}) };
  const bmi = calculateBmi(fields.height_cm, fields.weight_kg);
  if (bmi) fields.bmi = bmi;
  return { ...responses, fields };
}

const READONLY_FIELD_KEYS = new Set(["bmi"]);
const REMOVED_FITNESS_FIELD_KEYS = new Set(["licence_no"]);

export function validateMedicalResponses(
  schema: MedicalFormSchema,
  responses: MedicalFormResponses,
): string[] {
  const errors: string[] = [];
  const fields = withComputedBmi(responses).fields ?? {};

  for (const section of schema.sections) {
    if (section.kind !== "fields") continue;
    if (section.key === "investigations" || section.key === "supporting_documents") continue;
    for (const field of section.fields) {
      if (field.type === "system") continue;
      if (REMOVED_FITNESS_FIELD_KEYS.has(field.key)) continue;
      if (!field.required) continue;
      if (READONLY_FIELD_KEYS.has(field.key)) continue;
      const value = fields[field.key];
      if (!value?.toString().trim()) {
        errors.push(`${field.label} is required.`);
      }
    }
  }

  const clinicalVitalKeys = new Set<string>();
  for (const section of schema.sections) {
    if (section.kind === "fields" && section.key === "clinical_vitals") {
      for (const field of section.fields) clinicalVitalKeys.add(field.key);
    }
  }

  for (const eyeKey of ["visual_acuity_right", "visual_acuity_left"] as const) {
    if (!clinicalVitalKeys.has(eyeKey)) continue;
    const result = fields[eyeKey]?.toString().trim() ?? "";
    const failLabel = result.toLowerCase() === "fail";
    const noteKey = VISUAL_ACUITY_FAIL_NOTE_KEYS[eyeKey];
    if (failLabel && !fields[noteKey]?.toString().trim()) {
      const side = eyeKey === "visual_acuity_right" ? "right eye" : "left eye";
      errors.push(`Visual acuity (${side}): a reason is required when the result is Fail.`);
    }
  }

  for (const earKey of ["hearing_left", "hearing_right"] as const) {
    if (!clinicalVitalKeys.has(earKey)) continue;
    const result = fields[earKey]?.toString().trim() ?? "";
    const failLabel = result.toLowerCase() === "fail";
    const noteKey = HEARING_FAIL_NOTE_KEYS[earKey];
    if (failLabel && !fields[noteKey]?.toString().trim()) {
      const side = earKey === "hearing_left" ? "left ear" : "right ear";
      errors.push(`Hearing (${side}): a reason is required when the result is Fail.`);
    }
  }

  for (const section of schema.sections) {
    if (section.kind !== "table") continue;
    const rows = responses.tables?.[section.key] ?? [];
    if (rows.length === 0) {
      errors.push(`${section.title} must be completed.`);
      continue;
    }
    if (section.key === "medical_history") {
      for (let i = 0; i < rows.length; i++) {
        const yn = rows[i]?.yes_no;
        if (!yn?.toString().trim()) {
          errors.push(`Medical history row ${i + 1}: Yes / No is required.`);
        }
      }
    }
    if (section.key === "clinical_systems") {
      for (let i = 0; i < rows.length; i++) {
        const finding = rows[i]?.finding;
        if (!finding?.toString().trim()) {
          errors.push(`${rows[i]?.system ?? `System ${i + 1}`}: Normal / Abnormal is required.`);
        }
      }
    }
  }

  return errors;
}
