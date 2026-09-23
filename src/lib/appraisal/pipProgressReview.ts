import type { PipTableColumn, PipTableSection } from "./pipFormSchema";
import {
  ensureCoachingLogColumns,
  findCoachingLogColumns,
  normalizeCoachingLogRow,
  PIP_COACHING_COLUMN_KEYS,
  PIP_REVIEW_COLUMN_KEYS,
} from "./pipStages";
import { PIP_APPRAISAL_REF_KEY, PIP_GAP_ID_KEY, parseAppraisalRef } from "./pipGapChain";

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** @deprecated Legacy combined column — replaced by baseline + progress rating columns. */
export function isProgressVsBaselineColumn(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    column.key === "progress_vs_baseline" ||
    /progress.*vs.*baseline|baseline.*vs.*progress|progress versus baseline/.test(l)
  );
}

export function isBaselineRatingColumn(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    column.key === PIP_REVIEW_COLUMN_KEYS.baselineRating ||
    /^baseline rating/.test(l)
  );
}

export function isReviewProgressRatingColumn(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    column.key === PIP_REVIEW_COLUMN_KEYS.progressRating ||
    (/^progress rating/.test(l) && !/vs|versus|baseline/.test(l))
  );
}

export function isReviewPrefilledColumn(column: PipTableColumn): boolean {
  return (
    isBaselineRatingColumn(column) ||
    isReviewProgressRatingColumn(column) ||
    isProgressVsBaselineColumn(column)
  );
}

export function findReviewDateColumn(section: PipTableSection): PipTableColumn | undefined {
  return (
    section.columns.find((c) => c.type === "date") ??
    section.columns.find((c) =>
      /review date|session date|week ending|^date$|checkpoint date|assessment date|practical date|observation date|date of assessment/.test(
        norm(c.label),
      ),
    )
  );
}

export function normalizePipSessionDate(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

/** Supervisor appraisal rating imported with the performance gap row. */
export function getGapBaselineRating(
  gapId: string,
  tables: Record<string, Array<Record<string, string | number | null>>>,
  gapsSection: PipTableSection,
): number | null {
  const gapRow = (tables[gapsSection.key] ?? []).find(
    (r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId,
  );
  if (!gapRow) return null;
  const ref = parseAppraisalRef(gapRow[PIP_APPRAISAL_REF_KEY]);
  if (ref?.rating == null || !Number.isFinite(ref.rating)) return null;
  return ref.rating;
}

/** O(1) lookup map: normalized session date → progress rating for one gap. */
export function buildCoachingProgressRatingLookup(
  gapId: string,
  tables: Record<string, Array<Record<string, string | number | null>>>,
  coachingSection: PipTableSection,
): Map<string, string> {
  const map = new Map<string, string>();
  const trimmedGapId = gapId.trim();
  if (!trimmedGapId) return map;

  const logSection = ensureCoachingLogColumns(coachingSection);
  const cols = findCoachingLogColumns(logSection);
  const dateKey = cols.date?.key ?? PIP_COACHING_COLUMN_KEYS.date;
  const ratingKey = cols.progressRating?.key ?? PIP_COACHING_COLUMN_KEYS.progressRating;

  for (const row of tables[coachingSection.key] ?? []) {
    if (String(row[PIP_GAP_ID_KEY] ?? "") !== trimmedGapId) continue;
    const normalized = normalizeCoachingLogRow(row, logSection);
    const date = normalizePipSessionDate(normalized[dateKey]);
    const rating = String(normalized[ratingKey] ?? "").trim();
    if (date && rating) map.set(date, rating);
  }

  return map;
}

/** Progress rating from the coaching log row matching gap + session date. */
export function getCoachingProgressRatingForDate(
  gapId: string,
  sessionDate: string,
  tables: Record<string, Array<Record<string, string | number | null>>>,
  coachingSection: PipTableSection,
): string | null {
  const normalizedDate = normalizePipSessionDate(sessionDate);
  if (!normalizedDate) return null;

  const logSection = ensureCoachingLogColumns(coachingSection);
  const cols = findCoachingLogColumns(logSection);
  const dateKey = cols.date?.key ?? PIP_COACHING_COLUMN_KEYS.date;
  const ratingKey = cols.progressRating?.key ?? PIP_COACHING_COLUMN_KEYS.progressRating;

  const row = (tables[coachingSection.key] ?? [])
    .filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId)
    .map((r) => normalizeCoachingLogRow(r, logSection))
    .find((r) => normalizePipSessionDate(r[dateKey]) === normalizedDate);

  if (!row) return null;
  const rating = String(row[ratingKey] ?? "").trim();
  return rating || null;
}

export function formatRatingDisplay(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === "") return "—";
  return String(value).trim();
}
