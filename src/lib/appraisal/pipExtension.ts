import type { PipField, PipFormSchema, PipTableSection } from "./pipFormSchema";
import { isSystemField } from "./pipFormSchema";
import type { PipFormResponses } from "./pipInstances";
import { detectPipSectionRole, PIP_GAP_ID_KEY } from "./pipGapChain";
import {
  getGapFieldValue,
  isFinalOutcomeSection,
  pipGapFieldKey,
} from "./pipFinalOutcome";
import { readSupportPlanRow } from "./pipStages";

export const PIP_EXTENSION_PERIOD_LABEL = "Extension period";

export const PIP_EXTENSION_FREQUENCY_OPTIONS = ["Day(s)", "Week(s)", "Month(s)"] as const;

export const PIP_EXTENSION_FIELD_KEYS = {
  frequency: "pip_extension_frequency",
  revisedEndDate: "pip_revised_end_date",
} as const;

export type PipExtensionFieldRole =
  | "extension_period"
  | "extension_frequency"
  | "revised_end_date";

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function parseIsoDate(value: unknown): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(d: Date, months: number): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}

function isLegacyExtensionSummaryField(field: PipField): boolean {
  if (isSystemField(field)) return false;
  if (field.key === "pip_extension_summary") return true;
  const label = norm(field.label);
  return (
    label === "pip extension" ||
    /extension summary/.test(label) ||
    (/pip extended by/.test(label) && /summary|title|detail|description/.test(label))
  );
}

/** Detect extension-related fields by label (and stable keys for injected fields). */
export function pipExtensionFieldRole(field: PipField): PipExtensionFieldRole | null {
  if (isSystemField(field)) return null;
  if (isLegacyExtensionSummaryField(field)) return null;

  if (field.key === PIP_EXTENSION_FIELD_KEYS.frequency) return "extension_frequency";
  if (field.key === PIP_EXTENSION_FIELD_KEYS.revisedEndDate) return "revised_end_date";

  const label = norm(field.label);

  if (/revised.*(end )?date|extended end date|new end date|revised pip/.test(label)) {
    return "revised_end_date";
  }
  if (/extension frequency|extend.*frequency|extended.*frequency/.test(label)) {
    return "extension_frequency";
  }
  if (/^extension period\s*$/.test(label)) {
    return "extension_period";
  }
  if (/pip extended by/.test(label) && !/frequency|revised|date|summary|title/.test(label)) {
    return "extension_period";
  }

  return null;
}

export function isPipExtensionComputedField(field: PipField): boolean {
  return pipExtensionFieldRole(field) === "revised_end_date";
}

export function isPipExtensionInputField(field: PipField): boolean {
  const role = pipExtensionFieldRole(field);
  return role === "extension_period" || role === "extension_frequency";
}

export function computeRevisedEndDate(
  planEndDate: string,
  amount: number,
  frequency: string,
): string | null {
  const base = parseIsoDate(planEndDate);
  if (!base || !Number.isFinite(amount) || amount <= 0) return null;

  const f = norm(frequency);
  let revised: Date | null = null;

  if (/^day/.test(f)) revised = addDays(base, amount);
  else if (/^week/.test(f)) revised = addDays(base, amount * 7);
  else if (/^month/.test(f)) revised = addMonths(base, amount);
  else return null;

  return revised ? formatIsoDate(revised) : null;
}

export function collectPipExtensionFields(
  schema: PipFormSchema,
): Partial<Record<PipExtensionFieldRole, PipField>> {
  const map: Partial<Record<PipExtensionFieldRole, PipField>> = {};
  for (const section of schema.sections) {
    if (section.kind !== "fields" || !isFinalOutcomeSection(section)) continue;
    for (const field of section.fields) {
      const role = pipExtensionFieldRole(field);
      if (role && !map[role]) map[role] = field;
    }
  }
  return map;
}

function normalizeExtensionPeriodField(field: PipField): PipField {
  if (isSystemField(field) || pipExtensionFieldRole(field) !== "extension_period") {
    return field;
  }
  return {
    ...field,
    label: PIP_EXTENSION_PERIOD_LABEL,
    helpText:
      "Enter the number of days, weeks, or months — then choose the unit in Extension frequency.",
  };
}

/** Relabel extension period, drop legacy summary field, inject frequency + revised date. */
export function ensurePipExtensionFieldsInSchema(schema: PipFormSchema): PipFormSchema {
  return {
    ...schema,
    sections: schema.sections.map((section) => {
      if (section.kind !== "fields" || !isFinalOutcomeSection(section)) return section;

      const fields = section.fields
        .filter((f) => !isLegacyExtensionSummaryField(f))
        .map((f) => normalizeExtensionPeriodField(f));

      const periodIndex = fields.findIndex(
        (f) => pipExtensionFieldRole(f) === "extension_period",
      );
      if (periodIndex < 0) return { ...section, fields };

      const hasRole = (role: PipExtensionFieldRole) =>
        fields.some((f) => pipExtensionFieldRole(f) === role);

      const toInsert: PipField[] = [];
      if (!hasRole("extension_frequency")) {
        toInsert.push({
          key: PIP_EXTENSION_FIELD_KEYS.frequency,
          label: "Extension frequency",
          type: "select",
          options: [...PIP_EXTENSION_FREQUENCY_OPTIONS],
          helpText: "Choose whether the extension is in days, weeks, or months.",
        });
      }
      if (!hasRole("revised_end_date")) {
        toInsert.push({
          key: PIP_EXTENSION_FIELD_KEYS.revisedEndDate,
          label: "Revised end date",
          type: "date",
          helpText: "Auto-calculated from the plan end date plus the extension period.",
        });
      }

      if (toInsert.length === 0) return { ...section, fields };

      const nextFields = [...fields];
      nextFields.splice(periodIndex + 1, 0, ...toInsert);
      return { ...section, fields: nextFields };
    }),
  };
}

export function applyPipExtensionSideEffects(args: {
  schema: PipFormSchema;
  fields: Record<string, string | number | null | undefined>;
  gapId: string;
  tables: Record<string, Array<Record<string, string | number | null>>>;
  supportSection: PipTableSection;
}): Record<string, string | number | null | undefined> {
  const { schema, fields, gapId, tables, supportSection } = args;
  const trimmedGapId = gapId.trim();
  if (!trimmedGapId) return fields;

  const extensionFields = collectPipExtensionFields(schema);
  const periodField = extensionFields.extension_period;
  const frequencyField = extensionFields.extension_frequency;
  const revisedField = extensionFields.revised_end_date;

  if (!periodField) return fields;

  const next = { ...fields };
  const periodRaw = getGapFieldValue(next, periodField.key, trimmedGapId).trim();
  const frequencyRaw = frequencyField
    ? getGapFieldValue(next, frequencyField.key, trimmedGapId).trim()
    : "";
  const amount = Number.parseInt(periodRaw, 10);

  if (revisedField) {
    const revisedKey = pipGapFieldKey(revisedField.key, trimmedGapId);
    if (!periodRaw || !Number.isFinite(amount) || amount <= 0 || !frequencyRaw) {
      next[revisedKey] = "";
      return next;
    }

    const supportRow = (tables[supportSection.key] ?? []).find(
      (r) => String(r[PIP_GAP_ID_KEY] ?? "") === trimmedGapId,
    );
    const planEndDate = supportRow ? readSupportPlanRow(supportRow, supportSection).endDate : "";
    const revised = planEndDate
      ? computeRevisedEndDate(planEndDate, amount, frequencyRaw)
      : null;
    next[revisedKey] = revised ?? "";
  }

  return next;
}

/** Recompute revised end dates for every gap that has extension inputs. */
export function syncAllPipExtensions(
  schema: PipFormSchema,
  responses: PipFormResponses,
  supportSection: PipTableSection | null,
): PipFormResponses {
  if (!supportSection) return responses;

  const extensionFields = collectPipExtensionFields(schema);
  if (!extensionFields.extension_period) return responses;

  const tables = responses.tables ?? {};
  const gapIds = new Set<string>();
  for (const row of tables[supportSection.key] ?? []) {
    const id = String(row[PIP_GAP_ID_KEY] ?? "").trim();
    if (id) gapIds.add(id);
  }

  let fields = { ...(responses.fields ?? {}) };
  for (const gapId of gapIds) {
    fields = applyPipExtensionSideEffects({
      schema,
      fields,
      gapId,
      tables,
      supportSection,
    });
  }

  return { ...responses, fields };
}

function normalizeIsoDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10);
}

/** Whether this gap has an active extension (period + frequency filled). */
export function isGapExtended(
  gapId: string,
  schema: PipFormSchema,
  responses: PipFormResponses,
): boolean {
  const trimmed = gapId.trim();
  if (!trimmed) return false;

  const extensionFields = collectPipExtensionFields(schema);
  const periodField = extensionFields.extension_period;
  if (!periodField) return false;

  const fields = responses.fields ?? {};
  const periodRaw = getGapFieldValue(fields, periodField.key, trimmed).trim();
  const amount = Number.parseInt(periodRaw, 10);
  if (!Number.isFinite(amount) || amount <= 0) return false;

  const frequencyField = extensionFields.extension_frequency;
  if (!frequencyField) return true;

  return !!getGapFieldValue(fields, frequencyField.key, trimmed).trim();
}

/** Plan end date, or revised end date when the gap is extended. */
export function getGapEffectiveEndDate(
  gapId: string,
  schema: PipFormSchema,
  responses: PipFormResponses,
): string {
  const trimmed = gapId.trim();
  if (!trimmed) return "";

  const supportSection = schema.sections.find(
    (s) => s.kind === "table" && detectPipSectionRole(s) === "support",
  ) as PipTableSection | undefined;
  if (!supportSection) return "";

  const supportRow = (responses.tables?.[supportSection.key] ?? []).find(
    (r) => String(r[PIP_GAP_ID_KEY] ?? "") === trimmed,
  );
  if (!supportRow) return "";

  const planEnd = normalizeIsoDate(readSupportPlanRow(supportRow, supportSection).endDate);
  if (!isGapExtended(trimmed, schema, responses)) return planEnd;

  const extensionFields = collectPipExtensionFields(schema);
  const revisedField = extensionFields.revised_end_date;
  if (!revisedField) return planEnd;

  const revised = normalizeIsoDate(
    getGapFieldValue(responses.fields ?? {}, revisedField.key, trimmed),
  );
  return revised || planEnd;
}
