import type { PipFormSchema } from "./pipFormSchema";
import { isSystemField } from "./pipFormSchema";
import type { PipFormResponses } from "./pipInstances";
import { getGapEffectiveEndDate, isGapExtended } from "./pipExtension";
import { getGapFieldValue } from "./pipFinalOutcome";
import { resolvePipFieldControl } from "./pipFormControls";
import {
  buildAppraisalEvidenceHref,
  detectPipSectionRole,
  findGapChainSections,
  getGapOptions,
  PIP_APPRAISAL_REF_KEY,
  PIP_GAP_ID_KEY,
  parseAppraisalRef,
} from "./pipGapChain";
import { isGapTrackingComplete } from "./pipTrackingComplete";
import { isFinalOutcomeSection } from "./pipFinalOutcome";

/** Meta key for per-gap final outcome audit stamps. */
export function pipGapMetaKey(base: string, gapId: string): string {
  return `${base}__gap__${gapId.trim()}`;
}

function fieldHasContent(value: string | number | null | undefined): boolean {
  return String(value ?? "").trim() !== "";
}

function collectSignatureFields(schema: PipFormSchema): Array<{ key: string }> {
  const result: Array<{ key: string }> = [];
  for (const section of schema.sections) {
    if (section.kind !== "fields") continue;
    const role = detectPipSectionRole(section);
    if (role !== "outcome" && role !== "signatures") continue;
    for (const field of section.fields) {
      if (isSystemField(field)) continue;
      const spec = resolvePipFieldControl(field);
      if (spec.inputType === "signature" || field.type === "signature") {
        result.push({ key: field.key });
      }
    }
  }
  return result;
}

/** Any Stage 3 field answer exists for this gap (excluding HR-only sections). */
export function hasGapFinalOutcomeAnswers(
  gapId: string,
  schema: PipFormSchema,
  responses: PipFormResponses,
): boolean {
  const trimmed = gapId.trim();
  if (!trimmed) return false;

  const fields = responses.fields ?? {};
  const tables = responses.tables ?? {};

  for (const section of schema.sections) {
    if (!isFinalOutcomeSection(section) || detectPipSectionRole(section) === "hr_only") {
      continue;
    }
    if (section.kind === "fields") {
      for (const field of section.fields) {
        if (isSystemField(field)) continue;
        if (fieldHasContent(getGapFieldValue(fields, field.key, trimmed))) return true;
      }
    } else {
      for (const row of tables[section.key] ?? []) {
        if (String(row[PIP_GAP_ID_KEY] ?? "") !== trimmed) continue;
        if (Object.values(row).some((v) => fieldHasContent(v))) return true;
      }
    }
  }
  return false;
}

/** All signature fields in outcome / signatures sections are filled for this gap. */
export function isGapFinalOutcomeSigned(
  gapId: string,
  schema: PipFormSchema,
  responses: PipFormResponses,
): boolean {
  const trimmed = gapId.trim();
  if (!trimmed) return false;

  const signatureFields = collectSignatureFields(schema);
  if (signatureFields.length === 0) {
    return hasGapFinalOutcomeAnswers(trimmed, schema, responses);
  }

  const fields = responses.fields ?? {};
  return signatureFields.every((f) =>
    fieldHasContent(getGapFieldValue(fields, f.key, trimmed)),
  );
}

/**
 * Signed with no extension — entire gap workflow is view-only.
 */
export function isGapFullyLocked(
  gapId: string,
  schema: PipFormSchema,
  responses: PipFormResponses,
): boolean {
  const trimmed = gapId.trim();
  if (!trimmed) return false;
  return (
    isGapFinalOutcomeSigned(trimmed, schema, responses) &&
    !isGapExtended(trimmed, schema, responses)
  );
}

/**
 * Tracking rows cannot be added/edited when complete at the effective end date
 * and the gap is not extended (or the gap is fully locked).
 */
export function isGapTrackingEditingLocked(
  gapId: string,
  schema: PipFormSchema,
  responses: PipFormResponses,
): boolean {
  const trimmed = gapId.trim();
  if (!trimmed) return false;
  if (isGapFullyLocked(trimmed, schema, responses)) return true;
  return (
    isGapTrackingComplete(trimmed, schema, responses) &&
    !isGapExtended(trimmed, schema, responses)
  );
}

/** Gaps eligible for the Final outcome tab — tracking complete only. */
export function getFinalOutcomeGapOptions(
  schema: PipFormSchema,
  responses: PipFormResponses,
): { id: string; label: string }[] {
  const chain = findGapChainSections(schema);
  if (!chain.gaps) return [];

  return getGapOptions(responses.tables ?? {}, chain.gaps).filter((g) =>
    isGapTrackingComplete(g.id, schema, responses),
  );
}

/** Build display label + evidence href for a gap's linked appraisal reference field. */
export function getGapLinkedAppraisalDisplay(args: {
  gapId: string;
  schema: PipFormSchema;
  responses: PipFormResponses;
  appraisalId: string;
  appraisalPeriodLabel?: string;
}): { label: string; href: string | null } {
  const { gapId, schema, responses, appraisalId, appraisalPeriodLabel } = args;
  const chain = findGapChainSections(schema);
  if (!chain.gaps) return { label: "—", href: null };

  const gapRow = (responses.tables?.[chain.gaps.key] ?? []).find(
    (r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId.trim(),
  );
  if (!gapRow) return { label: "—", href: null };

  const ref = parseAppraisalRef(gapRow[PIP_APPRAISAL_REF_KEY]);
  if (!ref) return { label: "—", href: null };

  const hrefAppraisalId = ref.appraisalId ?? appraisalId;
  const itemLabel = ref.item?.trim() || "Performance area";
  const period = appraisalPeriodLabel?.trim();
  const label = period ? `${period} — ${itemLabel}` : itemLabel;

  if (ref.sectionKey === "_narrative" || !hrefAppraisalId) {
    return { label, href: null };
  }

  return {
    label,
    href: buildAppraisalEvidenceHref(hrefAppraisalId, ref.sectionKey, ref.item),
  };
}

export { getGapEffectiveEndDate, isGapExtended };
