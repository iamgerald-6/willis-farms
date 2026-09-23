import type { PipField, PipFormSchema, PipSection } from "./pipFormSchema";
import { isSystemField, pipFieldLabel } from "./pipFormSchema";
import type { AppraisalPip, PipFormResponses } from "./pipInstances";
import {
  detectPipSectionRole,
  findGapChainSections,
  getGapOptions,
  type PipAppraisalSummary,
} from "./pipGapChain";
import { getGapEffectiveEndDate } from "./pipExtension";
import {
  getGapLinkedAppraisalDisplay,
  hasGapFinalOutcomeAnswers,
  pipGapMetaKey,
} from "./pipGapLock";
import { isFinalOutcomeSection, pipGapFieldKey } from "./pipFinalOutcome";
import type { PipFormMeta } from "./pipStages";

export type PipHrAdminFieldRole =
  | "pip_opened_date"
  | "final_date"
  | "outcome_recorded_on"
  | "outcome_recorded_by"
  | "outcome_recorded_combined"
  | "linked_appraisal";

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function fieldLabel(field: PipField): string {
  return norm(pipFieldLabel(field));
}

function fieldHasContent(value: string | number | null | undefined): boolean {
  return String(value ?? "").trim() !== "";
}

/** HR-only field removed from the live form. */
export function isHrAdminFieldHidden(field: PipField): boolean {
  if (isSystemField(field)) return false;
  return /review reminders scheduled/.test(fieldLabel(field));
}

export function pipHrAdminFieldRole(field: PipField): PipHrAdminFieldRole | null {
  if (isSystemField(field)) return null;
  const label = fieldLabel(field);

  if (/linked appraisal reference|linked appraisal ref/.test(label)) {
    return "linked_appraisal";
  }
  if (
    /final outcome recorded on.*\/.*by/.test(label) ||
    /final outcome recorded on \(date\) \/ by/.test(label)
  ) {
    return "outcome_recorded_combined";
  }
  if (/final outcome recorded on|outcome recorded on \(date\)/.test(label) && !/\bby\b/.test(label)) {
    return "outcome_recorded_on";
  }
  if (/final outcome recorded by|outcome recorded by/.test(label)) {
    return "outcome_recorded_by";
  }
  if (/pip opened in hr system|pip opened.*hr system/.test(label)) {
    return "pip_opened_date";
  }
  if (
    /^final date$|plan end date|pip end date|effective end date|revised end date/.test(label) &&
    !/extension|frequency|period/.test(label)
  ) {
    return "final_date";
  }

  return null;
}

export function isHrAdminPrefilledField(field: PipField): boolean {
  return pipHrAdminFieldRole(field) != null;
}

function isHrOnlySection(section: PipSection): boolean {
  return detectPipSectionRole(section) === "hr_only";
}

export function ensureHrAdminFieldsInSchema(schema: PipFormSchema): PipFormSchema {
  return {
    ...schema,
    sections: schema.sections.map((section) => {
      if (section.kind !== "fields" || !isHrOnlySection(section)) return section;
      return {
        ...section,
        fields: section.fields.filter((field) => !isHrAdminFieldHidden(field)),
      };
    }),
  };
}

function formatDisplayDate(iso: string): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw.includes("T") ? raw : `${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isoDateFromTimestamp(timestamp: string | null | undefined): string {
  const raw = String(timestamp ?? "").trim();
  if (!raw) return "";
  return raw.slice(0, 10);
}

export function buildLinkedAppraisalLabel(summary: PipAppraisalSummary): string {
  const periodLabel =
    summary.review_quarter === "Q4"
      ? `Annual ${summary.review_year}`
      : `${summary.review_quarter} ${summary.review_year}`;
  const scorePart =
    summary.final_quarter_score != null
      ? ` · ${summary.final_quarter_score.toFixed(1)}% (${summary.score_band})`
      : "";
  return `${periodLabel} — ${summary.employee_name}${scorePart}`;
}

function buildAppraisalPeriodLabel(summary: PipAppraisalSummary | null): string | undefined {
  if (!summary) return undefined;
  return summary.review_quarter === "Q4"
    ? `Annual ${summary.review_year}`
    : `${summary.review_quarter} ${summary.review_year}`;
}

function sectionHasOutcomeAuditFields(schema: PipFormSchema): boolean {
  return schema.sections.some(
    (section) =>
      section.kind === "fields" &&
      isHrOnlySection(section) &&
      section.fields.some((f) => {
        const role = pipHrAdminFieldRole(f);
        return (
          role === "outcome_recorded_on" ||
          role === "outcome_recorded_by" ||
          role === "outcome_recorded_combined"
        );
      }),
  );
}

/** Any Stage 3 answer exists (excluding HR-only sections). */
export function hasFinalOutcomeAnswers(
  schema: PipFormSchema,
  responses: PipFormResponses,
): boolean {
  const chain = findGapChainSections(schema);
  if (!chain.gaps) return false;

  return getGapOptions(responses.tables ?? {}, chain.gaps).some((g) =>
    hasGapFinalOutcomeAnswers(g.id, schema, responses),
  );
}

function setGapFieldValue(
  fields: Record<string, string | number | null | undefined>,
  field: PipField,
  gapId: string,
  value: string,
): void {
  fields[pipGapFieldKey(field.key, gapId)] = value;
}

function getGapOutcomeRecordedAt(meta: PipFormMeta, gapId: string): string {
  return String(meta[pipGapMetaKey("final_outcome_recorded_at", gapId)] ?? "").trim();
}

function getGapOutcomeRecordedBy(meta: PipFormMeta, gapId: string): string {
  return String(meta[pipGapMetaKey("final_outcome_recorded_by", gapId)] ?? "").trim();
}

export function applyHrAdminPrefills(args: {
  schema: PipFormSchema;
  responses: PipFormResponses;
  pip: Pick<AppraisalPip, "created_at"> | null;
  appraisalSummary: PipAppraisalSummary | null;
  appraisalId?: string;
  actorName?: string | null;
}): PipFormResponses {
  const { schema, pip, appraisalSummary, appraisalId, actorName } = args;
  const fields = { ...(args.responses.fields ?? {}) };
  let meta: PipFormMeta = { ...(args.responses.meta ?? {}) };

  const chain = findGapChainSections(schema);
  const gapIds = chain.gaps
    ? getGapOptions(args.responses.tables ?? {}, chain.gaps).map((g) => g.id)
    : [];

  const periodLabel = buildAppraisalPeriodLabel(appraisalSummary);
  const pipOpenedIso = pip?.created_at ? isoDateFromTimestamp(pip.created_at) : "";
  const stampOutcomeFields = sectionHasOutcomeAuditFields(schema);

  for (const section of schema.sections) {
    if (section.kind !== "fields" || !isFinalOutcomeSection(section)) continue;

    for (const gapId of gapIds) {
      for (const field of section.fields) {
        const role = pipHrAdminFieldRole(field);
        if (role === "pip_opened_date" && pipOpenedIso) {
          setGapFieldValue(fields, field, gapId, pipOpenedIso);
        } else if (role === "final_date") {
          const effectiveEnd = getGapEffectiveEndDate(gapId, schema, {
            ...args.responses,
            fields,
            meta,
          });
          if (effectiveEnd) setGapFieldValue(fields, field, gapId, effectiveEnd);
        } else if (role === "linked_appraisal" && appraisalId) {
          const { label } = getGapLinkedAppraisalDisplay({
            gapId,
            schema,
            responses: { ...args.responses, fields, meta },
            appraisalId,
            appraisalPeriodLabel: periodLabel,
          });
          if (label && label !== "—") {
            setGapFieldValue(fields, field, gapId, label);
          } else if (appraisalSummary) {
            setGapFieldValue(fields, field, gapId, buildLinkedAppraisalLabel(appraisalSummary));
          }
        }
      }
    }
  }

  if (stampOutcomeFields) {
    for (const gapId of gapIds) {
      const hasAnswers = hasGapFinalOutcomeAnswers(gapId, schema, {
        ...args.responses,
        fields,
        meta,
      });
      if (!hasAnswers) continue;

      const atKey = pipGapMetaKey("final_outcome_recorded_at", gapId);
      const byKey = pipGapMetaKey("final_outcome_recorded_by", gapId);

      if (!meta[atKey]) {
        meta = {
          ...meta,
          [atKey]: new Date().toISOString(),
          [byKey]: actorName?.trim() || null,
        };
      } else if (!meta[byKey] && actorName?.trim()) {
        meta = { ...meta, [byKey]: actorName.trim() };
      }
    }
  }

  for (const section of schema.sections) {
    if (section.kind !== "fields" || !isFinalOutcomeSection(section)) continue;

    for (const gapId of gapIds) {
      const recordedAt = getGapOutcomeRecordedAt(meta, gapId);
      const recordedBy = getGapOutcomeRecordedBy(meta, gapId);
      const recordedDateDisplay = recordedAt ? formatDisplayDate(recordedAt) : "";
      const recordedDateIso = recordedAt ? isoDateFromTimestamp(recordedAt) : "";

      for (const field of section.fields) {
        const role = pipHrAdminFieldRole(field);
        if (role === "outcome_recorded_on" && recordedDateIso) {
          setGapFieldValue(fields, field, gapId, recordedDateIso);
        } else if (role === "outcome_recorded_by" && recordedBy) {
          setGapFieldValue(fields, field, gapId, recordedBy);
        } else if (role === "outcome_recorded_combined") {
          if (recordedDateDisplay && recordedBy) {
            setGapFieldValue(fields, field, gapId, `${recordedDateDisplay} / ${recordedBy}`);
          } else if (recordedDateDisplay) {
            setGapFieldValue(fields, field, gapId, recordedDateDisplay);
          }
        }
      }
    }
  }

  return { ...args.responses, fields, meta };
}

export function syncHrAdminPrefills(
  schema: PipFormSchema,
  responses: PipFormResponses,
  context: {
    pip: Pick<AppraisalPip, "created_at"> | null;
    appraisalSummary: PipAppraisalSummary | null;
    appraisalId?: string;
    actorName?: string | null;
  },
): PipFormResponses {
  return applyHrAdminPrefills({ schema, responses, ...context });
}
