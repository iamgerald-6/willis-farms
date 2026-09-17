import type { MedicalFormSchema, MedicalFormResponses } from "./medicalFormSchema";
import { calculateBmi } from "./medicalClinicalVitals";
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

/** Migrate legacy Part 4 table rows into structured investigations if needed. */
export function ensureInvestigationsData(responses: MedicalFormResponses): MedicalFormResponses {
  if (responses.investigations) {
    return responses;
  }
  const legacyRows = responses.tables?.investigations;
  if (!legacyRows?.length) {
    return { ...responses, investigations: emptyInvestigationsData() };
  }
  // Legacy table cannot map cleanly — start fresh structured object
  return { ...responses, investigations: emptyInvestigationsData() };
}

/** Pre-fill fixed-row tables; init investigations object. */
export function buildInitialMedicalResponses(schema: MedicalFormSchema): MedicalFormResponses {
  const tables: MedicalFormResponses["tables"] = {};

  for (const section of schema.sections) {
    if (section.kind !== "table") continue;
    if (section.key === "medical_history") {
      tables[section.key] = seedTableRows(MEDICAL_HISTORY_ITEMS, "item");
    } else if (section.key === "clinical_systems") {
      tables[section.key] = seedTableRows(CLINICAL_SYSTEM_ROWS, "system");
    } else {
      tables[section.key] = Array.from({ length: section.minRows || 1 }, () =>
        Object.fromEntries(section.columns.map((col) => [col.key, ""])),
      );
    }
  }

  return { fields: {}, tables, investigations: emptyInvestigationsData() };
}

/** Sync computed BMI into field responses when height/weight present. */
export function withComputedBmi(responses: MedicalFormResponses): MedicalFormResponses {
  const fields = { ...(responses.fields ?? {}) };
  const bmi = calculateBmi(fields.height_cm, fields.weight_kg);
  if (bmi) fields.bmi = bmi;
  return { ...responses, fields };
}

const READONLY_FIELD_KEYS = new Set(["bmi"]);

export function validateMedicalResponses(
  schema: MedicalFormSchema,
  responses: MedicalFormResponses,
): string[] {
  const errors: string[] = [];
  const fields = withComputedBmi(responses).fields ?? {};

  for (const section of schema.sections) {
    if (section.kind !== "fields") continue;
    if (section.key === "investigations") continue;
    for (const field of section.fields) {
      if (field.type === "system") continue;
      if (!field.required) continue;
      if (READONLY_FIELD_KEYS.has(field.key)) continue;
      const value = fields[field.key];
      if (!value?.toString().trim()) {
        errors.push(`${field.label} is required.`);
      }
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
