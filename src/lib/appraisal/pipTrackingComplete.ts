import type { PipFormSchema, PipTableSection } from "./pipFormSchema";
import type { PipFormResponses } from "./pipInstances";
import {
  detectPipSectionRole,
  findGapChainSections,
  getGapOptions,
  PIP_GAP_ID_KEY,
} from "./pipGapChain";
import { getGapEffectiveEndDate } from "./pipExtension";
import {
  ensureCoachingLogColumns,
  findCoachingLogColumns,
  isCoachingSection,
  normalizeCoachingLogRow,
  PIP_COACHING_COLUMN_KEYS,
  readSupportPlanRow,
} from "./pipStages";

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function normalizeDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10);
}

function findReviewDateColumnKey(section: PipTableSection): string | undefined {
  const col =
    section.columns.find((c) => c.type === "date") ??
    section.columns.find((c) =>
      /review date|session date|week ending|^date$|checkpoint date/.test(norm(c.label)),
    );
  return col?.key;
}

function findReviewStatusColumnKey(section: PipTableSection): string | undefined {
  const col = section.columns.find((c) => {
    const l = norm(c.label);
    return (/\bstatus\b/.test(l) && /on track|partial|off track/.test(l)) || /^status$/.test(l);
  });
  return col?.key;
}

function coachingRowComplete(
  row: Record<string, string | number | null>,
  cols: ReturnType<typeof findCoachingLogColumns>,
): boolean {
  const coachedKey = cols.coachedObserved?.key ?? PIP_COACHING_COLUMN_KEYS.coachedObserved;
  const ratingKey = cols.progressRating?.key ?? PIP_COACHING_COLUMN_KEYS.progressRating;
  return (
    !!String(row[coachedKey] ?? "").trim() && !!String(row[ratingKey] ?? "").trim()
  );
}

function reviewRowComplete(
  row: Record<string, string | number | null>,
  statusKey: string | undefined,
): boolean {
  if (!statusKey) return true;
  return !!String(row[statusKey] ?? "").trim();
}

/**
 * Tracking is complete when the effective end date (plan or revised if extended)
 * has filled entries in both the coaching log and formal progress review.
 */
export function isGapTrackingComplete(
  gapId: string,
  schema: PipFormSchema,
  responses: PipFormResponses,
): boolean {
  const trimmedGapId = gapId.trim();
  if (!trimmedGapId) return false;

  const chain = findGapChainSections(schema);
  if (!chain.support) return false;

  const supportRow = (responses.tables?.[chain.support.key] ?? []).find(
    (r) => String(r[PIP_GAP_ID_KEY] ?? "") === trimmedGapId,
  );
  if (!supportRow) return false;

  const endDate = normalizeDate(getGapEffectiveEndDate(trimmedGapId, schema, responses));
  if (!endDate) return false;

  const coachingSection = schema.sections.find(isCoachingSection);
  if (!coachingSection || coachingSection.kind !== "table") return false;

  const logSection = ensureCoachingLogColumns(coachingSection);
  const cols = findCoachingLogColumns(logSection);
  const dateKey = cols.date?.key ?? PIP_COACHING_COLUMN_KEYS.date;

  const coachingRow = (responses.tables?.[coachingSection.key] ?? [])
    .filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === trimmedGapId)
    .map((r) => normalizeCoachingLogRow(r, logSection))
    .find((r) => normalizeDate(r[dateKey]) === endDate);

  if (!coachingRow || !coachingRowComplete(coachingRow, cols)) return false;

  const reviewsSection = schema.sections.find(
    (s) => s.kind === "table" && detectPipSectionRole(s) === "reviews",
  ) as PipTableSection | undefined;

  if (!reviewsSection) return true;

  const reviewDateKey = findReviewDateColumnKey(reviewsSection);
  const statusKey = findReviewStatusColumnKey(reviewsSection);
  if (!reviewDateKey) return false;

  const reviewRow = (responses.tables?.[reviewsSection.key] ?? [])
    .filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === trimmedGapId)
    .find((r) => normalizeDate(r[reviewDateKey]) === endDate);

  if (!reviewRow || !reviewRowComplete(reviewRow, statusKey)) return false;

  return true;
}

export function getTrackingCompleteGapOptions(
  schema: PipFormSchema,
  responses: PipFormResponses,
): { id: string; label: string }[] {
  const chain = findGapChainSections(schema);
  if (!chain.gaps) return [];

  return getGapOptions(responses.tables ?? {}, chain.gaps).filter((g) =>
    isGapTrackingComplete(g.id, schema, responses),
  );
}
