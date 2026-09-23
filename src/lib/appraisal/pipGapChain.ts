import type { Ratings, SectionDef } from "./scoring";
import { ITEM_RATING_MAX, bandLabel } from "./scoring";
import type { PipFormSchema, PipSection, PipTableColumn, PipTableSection } from "./pipFormSchema";

/** Default support-action types for Section 5 — editable in PIP form setup. */
export const DEFAULT_PIP_SUPPORT_ACTION_OPTIONS = [
  "Training",
  "Coaching",
  "Refreshers",
  "Resources",
  "System fixes",
] as const;

/** Stable row id linking Section 2 → 3 → 5. Stored on table rows, not shown as a column. */
export const PIP_GAP_ID_KEY = "_gap_id";
export const PIP_APPRAISAL_REF_KEY = "_appraisal_ref";

/** Minimum supervisor rating expected on a PIP — scores below this are imported into Section 2. */
export const PIP_EXPECTED_RATING = 4;

/** PIP gap labels — 3 is Average on the plan, not appraisal-form "Meets Expectation". */
const PIP_GAP_RATING_LABELS: Record<number, string> = {
  1: "Unsatisfactory",
  2: "Below Expectation",
  3: "Average",
  4: "Above Expectation",
  5: "Excellent",
};

function pipExpectedStandardDisplay(): string {
  return `${PIP_EXPECTED_RATING}/${ITEM_RATING_MAX} (target)`;
}

function pipActualPerformanceDisplay(rating: number, comment: string): string {
  const label = PIP_GAP_RATING_LABELS[rating] ?? String(rating);
  return `${rating}/${ITEM_RATING_MAX} — ${label}${comment ? `. ${comment}` : ""}`;
}

export interface PipAppraisalRef {
  appraisalId?: string;
  sectionKey: string;
  item: string;
  rating: number | null;
}

export function parseAppraisalRef(raw: unknown): PipAppraisalRef | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed =
      typeof raw === "string" ? (JSON.parse(raw) as PipAppraisalRef) : (raw as PipAppraisalRef);
    if (!parsed?.sectionKey || !parsed?.item) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** DOM id for a review-area row on the appraisal detail page. */
export function appraisalRatingAnchorId(sectionKey: string, item: string): string {
  return `appraisal-rating-${sectionKey}-${encodeURIComponent(item)}`;
}

export function buildAppraisalEvidenceHref(
  appraisalId: string,
  sectionKey: string,
  item: string,
): string {
  return `/dashboard/humanCapital/appraisal/${appraisalId}#${appraisalRatingAnchorId(sectionKey, item)}`;
}

function isGapCoreDataColumn(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    /performance area|^area$|topic|^gap$/.test(l) ||
    /expected|standard|target/.test(l) ||
    /actual|observed/.test(l) ||
    isGapReferenceColumn(column)
  );
}

export function isEvidenceColumn(column: PipTableColumn): boolean {
  if (isAutoIncrementCol(column) || isGapCoreDataColumn(column)) return false;
  const l = norm(column.label);
  return /evidence|proof|incident|reference|documentation|record|link|source|supporting/.test(l);
}

/** Evidence column on the Performance Gaps table — label match or last non-core column. */
export function findGapEvidenceColumn(gapsSection: PipTableSection): PipTableColumn | undefined {
  const labeled = gapsSection.columns.find(
    (col) => !isAutoIncrementCol(col) && isEvidenceColumn(col),
  );
  if (labeled) return labeled;

  const nonCore = gapsSection.columns.filter(
    (col) => !isAutoIncrementCol(col) && !isGapCoreDataColumn(col),
  );
  return nonCore[nonCore.length - 1];
}

export type PipSectionRole =
  | "gaps"
  | "root_cause"
  | "support"
  | "objectives"
  | "coaching"
  | "reviews"
  | "competency"
  | "employee_comments"
  | "outcome"
  | "signatures"
  | "hr_only"
  | null;

export interface PipGapChainSections {
  gaps: PipTableSection | null;
  rootCause: PipTableSection | null;
  support: PipTableSection | null;
}

export interface AppraisalWeakItem {
  sectionKey: string;
  sectionTitle: string;
  item: string;
  expectedStandard: string;
  rating: number | null;
  ratingLabel: string;
  comment: string;
  actualPerformance: string;
  evidence: string;
}

export interface PipAppraisalSummary {
  id: string;
  review_quarter: string;
  review_year: number;
  employee_name: string;
  final_quarter_score: number | null;
  score_band: string;
  improvement_areas: string | null;
  strengths_observed: string | null;
  weak_items: AppraisalWeakItem[];
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Review-area labels from the employee's appraisal template — used for Task assigned dropdowns. */
export function collectTemplateReviewItems(sections: SectionDef[] | null | undefined): string[] {
  if (!sections?.length) return [];
  const items = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      const trimmed = item.trim();
      if (trimmed) items.add(trimmed);
    }
  }
  return [...items].sort((a, b) => a.localeCompare(b));
}

export function newGapId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `gap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Detect workflow role for setup badges and fill hints. */
export function detectPipSectionRole(section: PipSection): PipSectionRole {
  if (section.kind === "fields") {
    const t = norm(section.title);
    if (/employee|plan detail|pip detail/.test(t)) return null;
    if (/employee.*comment|comment.*employee/.test(t)) return "employee_comments";
    if (/final outcome|outcome.*pip/.test(t)) return "outcome";
    if (/sign|acknowledge|acknowledgment/.test(t)) return "signatures";
    if (/hr use|hr only|for hr/.test(t)) return "hr_only";
    return null;
  }

  const t = norm(section.title);
  if (/performance\s*gap|gap.*appraisal|deficien/.test(t)) return "gaps";
  if (/root.?cause|diagnos.*before/.test(t)) return "root_cause";
  if (/support.*development|development.*support|support.*provided/.test(t)) return "support";
  if (/objective|smart|goal|target.*plan/.test(t)) return "objectives";
  if (/coaching|weekly.*log|check.?in|training.*log|session\s*log|frequency\s*log/.test(t)) {
    return "coaching";
  }
  if (/formal.*review|progress review|checkpoint/.test(t)) return "reviews";
  if (/competenc|re.?assess|practical.*task/.test(t)) return "competency";
  if (/hr use|hr only/.test(t)) return "hr_only";
  return null;
}

export function pipSectionRoleLabel(role: PipSectionRole): string | null {
  switch (role) {
    case "gaps":
      return "From appraisal";
    case "root_cause":
      return "Links to gaps";
    case "support":
      return "Links to gaps";
    case "objectives":
      return "SMART objectives";
    case "coaching":
      return "Frequency log";
    case "reviews":
      return "Formal reviews";
    case "competency":
      return "Competency check";
    case "employee_comments":
      return "Employee voice";
    case "outcome":
      return "Final outcome";
    case "signatures":
      return "Signatures";
    case "hr_only":
      return "HR only";
    default:
      return null;
  }
}

export function findGapChainSections(schema: PipFormSchema): PipGapChainSections {
  let gaps: PipTableSection | null = null;
  let rootCause: PipTableSection | null = null;
  let support: PipTableSection | null = null;

  for (const section of schema.sections) {
    if (section.kind !== "table") continue;
    const role = detectPipSectionRole(section);
    if (role === "gaps" && !gaps) gaps = section;
    if (role === "root_cause" && !rootCause) rootCause = section;
    if (role === "support" && !support) support = section;
  }

  return { gaps, rootCause, support };
}

export function hasGapChain(schema: PipFormSchema): boolean {
  const { gaps, rootCause } = findGapChainSections(schema);
  return !!(gaps && rootCause);
}

export function isSupportActionColumn(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    /support action|type of support|support type|intervention|development action/.test(l) ||
    (/\bsupport\b/.test(l) && /\baction|type|provided\b/.test(l))
  );
}

export function supportActionOptionsForColumn(column: PipTableColumn): string[] {
  if (column.type === "select" && column.options?.length) {
    return column.options;
  }
  return [...DEFAULT_PIP_SUPPORT_ACTION_OPTIONS];
}

export function isGapReferenceColumn(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    (/\bgap\b/.test(l) && /section\s*2|from section|performance gap/.test(l)) ||
    l === "gap" ||
    l === "gap from section 2"
  );
}

function findColumn(columns: PipTableColumn[], pattern: RegExp): PipTableColumn | undefined {
  return columns.find((c) => pattern.test(norm(c.label)));
}

function isAutoIncrementCol(column: PipTableColumn): boolean {
  const compact = column.label.trim().toLowerCase().replace(/[^a-z0-9#]/g, "");
  return ["no", "#", "sn", "review", "week"].includes(compact);
}

export function gapDisplayLabel(
  row: Record<string, string | number | null>,
  gapsSection: PipTableSection,
): string {
  const areaCol = findColumn(gapsSection.columns, /performance area|^area$|topic|^gap$/);
  const label = areaCol ? String(row[areaCol.key] ?? "").trim() : "";
  if (label) return label;
  const first = gapsSection.columns.find((c) => !isAutoIncrementCol(c));
  return first ? String(row[first.key] ?? "").trim() || "Untitled gap" : "Gap";
}

export function ensureGapId(row: Record<string, string | number | null>): string {
  const existing = row[PIP_GAP_ID_KEY];
  if (existing != null && String(existing).trim()) return String(existing);
  return newGapId();
}

function humanizeSectionKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sectionTitleForKey(sectionKey: string, templateSections?: SectionDef[] | null): string {
  const match = templateSections?.find((s) => s.key === sectionKey);
  if (match?.title?.trim()) return match.title.trim();
  return humanizeSectionKey(sectionKey);
}

/** Pull under-performing review areas from the supervisor's final appraisal ratings. */
export function extractWeakItemsFromAppraisal(
  appraisal: {
    supervisor_ratings?: Ratings | null;
    employee_ratings?: Ratings | null;
    improvement_areas?: string | null;
  },
  templateSections?: SectionDef[] | null,
): AppraisalWeakItem[] {
  const supervisorRatings = (appraisal.supervisor_ratings as Ratings | null | undefined) ?? {};
  const items: AppraisalWeakItem[] = [];

  const sections: SectionDef[] = templateSections?.length
    ? templateSections
    : Object.keys(supervisorRatings).map((key) => ({
        key,
        title: sectionTitleForKey(key, templateSections),
        weight: 0,
        items: Object.keys(supervisorRatings[key] ?? {}),
      }));

  for (const section of sections) {
    const sectionTitle = sectionTitleForKey(section.key, templateSections);
    for (const item of section.items) {
      const entry = supervisorRatings[section.key]?.[item];
      const rating = entry?.rating;
      if (rating == null || rating >= PIP_EXPECTED_RATING) continue;

      const comment = String(entry?.comment ?? "").trim();
      const ratingLabel = PIP_GAP_RATING_LABELS[rating] ?? `${rating}/${ITEM_RATING_MAX}`;
      const actualPerformance = pipActualPerformanceDisplay(rating, comment);

      items.push({
        sectionKey: section.key,
        sectionTitle,
        item,
        expectedStandard: pipExpectedStandardDisplay(),
        rating,
        ratingLabel,
        comment,
        actualPerformance,
        evidence: "",
      });
    }
  }

  const improvement = String(appraisal.improvement_areas ?? "").trim();
  if (improvement && items.length === 0) {
    items.push({
      sectionKey: "_narrative",
      sectionTitle: "General",
      item: improvement,
      expectedStandard: improvement,
      rating: null,
      ratingLabel: "—",
      comment: improvement,
      actualPerformance: improvement,
      evidence: "Recorded under Improvement areas on the appraisal form.",
    });
  }

  return items;
}

function mapWeakItemToGapRow(
  weak: AppraisalWeakItem,
  gapsSection: PipTableSection,
  gapId: string,
  appraisalId?: string,
): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = {
    [PIP_GAP_ID_KEY]: gapId,
    [PIP_APPRAISAL_REF_KEY]: JSON.stringify({
      ...(appraisalId ? { appraisalId } : {}),
      sectionKey: weak.sectionKey,
      item: weak.item,
      rating: weak.rating,
    }),
  };

  const evidenceCol = findGapEvidenceColumn(gapsSection);

  for (const col of gapsSection.columns) {
    if (isAutoIncrementCol(col)) continue;
    const l = norm(col.label);
    if (/performance area|^area$|topic|^gap$/.test(l)) {
      row[col.key] =
        weak.sectionKey === "_narrative" ? weak.sectionTitle : weak.item;
    } else if (/expected|standard|target/.test(l)) {
      row[col.key] = weak.expectedStandard || weak.item;
    } else if (/actual|observed/.test(l)) {
      row[col.key] = weak.actualPerformance;
    } else if (evidenceCol && col.key === evidenceCol.key) {
      row[col.key] = "";
    } else {
      row[col.key] = "";
    }
  }

  return row;
}

export function buildGapRowsFromAppraisal(
  gapsSection: PipTableSection,
  appraisal: Parameters<typeof extractWeakItemsFromAppraisal>[0],
  templateSections?: SectionDef[] | null,
  appraisalId?: string,
): Array<Record<string, string | number | null>> {
  const weakItems = extractWeakItemsFromAppraisal(appraisal, templateSections);
  if (!weakItems.length) {
    return [Object.fromEntries(gapsSection.columns.map((c) => [c.key, ""]))];
  }
  return weakItems.map((weak) =>
    mapWeakItemToGapRow(weak, gapsSection, newGapId(), appraisalId),
  );
}

function blankRootCauseRow(
  rootCauseSection: PipTableSection,
  gapId: string,
  gapLabel: string,
): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = { [PIP_GAP_ID_KEY]: gapId };
  for (const col of rootCauseSection.columns) {
    if (isGapReferenceColumn(col)) row[col.key] = gapLabel;
    else row[col.key] = "";
  }
  return row;
}

function defaultSupportActionForSection(supportSection: PipTableSection): string {
  const actionCol = supportSection.columns.find(isSupportActionColumn);
  if (actionCol) {
    return supportActionOptionsForColumn(actionCol)[0] ?? DEFAULT_PIP_SUPPORT_ACTION_OPTIONS[0];
  }
  return DEFAULT_PIP_SUPPORT_ACTION_OPTIONS[0];
}

function prefilledSupportRow(
  supportSection: PipTableSection,
  gapId: string,
  gapLabel: string,
  supervisorName?: string,
): Record<string, string | number | null> {
  const defaultAction = defaultSupportActionForSection(supportSection);
  const row: Record<string, string | number | null> = { [PIP_GAP_ID_KEY]: gapId };
  for (const col of supportSection.columns) {
    const l = col.label.toLowerCase().trim();
    if (isGapReferenceColumn(col)) row[col.key] = gapLabel;
    else if (isSupportActionColumn(col)) row[col.key] = defaultAction;
    else if (col.key === "provided_by" || /provided by/.test(l)) {
      row[col.key] = supervisorName?.trim() || "";
    } else if (col.key === "frequency" || /frequency/.test(l)) row[col.key] = "Weekly";
    else row[col.key] = "";
  }
  return row;
}

export function syncGapChainTables(
  tables: Record<string, Array<Record<string, string | number | null>>>,
  chain: PipGapChainSections,
): Record<string, Array<Record<string, string | number | null>>> {
  if (!chain.gaps) return tables;

  const next = { ...tables };
  const gapRows = (next[chain.gaps.key] ?? []).map((row) => {
    const gapId = ensureGapId(row);
    return { ...row, [PIP_GAP_ID_KEY]: gapId };
  });
  next[chain.gaps.key] = gapRows;

  const gapMeta = gapRows.map((row) => ({
    id: String(row[PIP_GAP_ID_KEY]),
    label: gapDisplayLabel(row, chain.gaps!),
  }));

  if (chain.rootCause) {
    const existing = next[chain.rootCause.key] ?? [];
    const byGapId = new Map(
      existing.filter((r) => r[PIP_GAP_ID_KEY]).map((r) => [String(r[PIP_GAP_ID_KEY]), r]),
    );

    next[chain.rootCause.key] = gapMeta.map(({ id, label }) => {
      const prev = byGapId.get(id);
      if (prev) {
        const updated: Record<string, string | number | null> = {
          ...prev,
          [PIP_GAP_ID_KEY]: id,
        };
        for (const col of chain.rootCause!.columns) {
          if (isGapReferenceColumn(col)) updated[col.key] = label;
        }
        return updated;
      }
      return blankRootCauseRow(chain.rootCause!, id, label);
    });
  }

  if (chain.support) {
    const existing = next[chain.support.key] ?? [];
    const byGapId = new Map(
      existing.filter((r) => r[PIP_GAP_ID_KEY]).map((r) => [String(r[PIP_GAP_ID_KEY]), r]),
    );

    next[chain.support.key] = gapMeta.map(({ id, label }) => {
      const prev = byGapId.get(id);
      if (prev) {
        const updated: Record<string, string | number | null> = {
          ...prev,
          [PIP_GAP_ID_KEY]: id,
        };
        for (const col of chain.support!.columns) {
          if (isGapReferenceColumn(col)) updated[col.key] = label;
          else if (isSupportActionColumn(col) && !String(updated[col.key] ?? "").trim()) {
            updated[col.key] = defaultSupportActionForSection(chain.support!);
          }
        }
        return updated;
      }
      return prefilledSupportRow(chain.support!, id, label);
    });
  }

  return next;
}

export function getGapOptions(
  tables: Record<string, Array<Record<string, string | number | null>>>,
  gapsSection: PipTableSection,
): { id: string; label: string }[] {
  return (tables[gapsSection.key] ?? []).map((row) => ({
    id: String(ensureGapId(row)),
    label: gapDisplayLabel(row, gapsSection),
  }));
}

export function gapLabelForId(
  gapId: string,
  tables: Record<string, Array<Record<string, string | number | null>>>,
  gapsSection: PipTableSection,
): string {
  const row = (tables[gapsSection.key] ?? []).find((r) => String(r[PIP_GAP_ID_KEY]) === gapId);
  return row ? gapDisplayLabel(row, gapsSection) : "Unknown gap";
}

export function prepareResponsesWithGapChain(
  responses: {
    fields?: Record<string, unknown>;
    tables?: Record<string, Array<Record<string, string | number | null>>>;
    meta?: Record<string, string | null | undefined>;
  },
  schema: PipFormSchema,
): {
  fields: Record<string, string | number | null>;
  tables: Record<string, Array<Record<string, string | number | null>>>;
  meta?: Record<string, string | null | undefined>;
} {
  const chain = findGapChainSections(schema);
  const tables = syncGapChainTables(responses.tables ?? {}, chain);
  return {
    fields: (responses.fields ?? {}) as Record<string, string | number | null>,
    tables,
    meta: responses.meta,
  };
}

/** Rebuild Section 2 gaps from appraisal and re-sync linked Sections 3 & 5. */
export function refreshGapChainInResponses(
  existing: {
    fields?: Record<string, string | number | null>;
    tables?: Record<string, Array<Record<string, string | number | null>>>;
  },
  schema: PipFormSchema,
  appraisal: Parameters<typeof extractWeakItemsFromAppraisal>[0],
  templateSections?: SectionDef[] | null,
  appraisalId?: string,
): {
  fields: Record<string, string | number | null>;
  tables: Record<string, Array<Record<string, string | number | null>>>;
  gapCount: number;
} {
  const chain = findGapChainSections(schema);
  if (!chain.gaps) {
    return {
      fields: (existing.fields ?? {}) as Record<string, string | number | null>,
      tables: existing.tables ?? {},
      gapCount: 0,
    };
  }

  const gapRows = buildGapRowsFromAppraisal(
    chain.gaps,
    appraisal,
    templateSections,
    appraisalId,
  );

  return {
    ...prepareResponsesWithGapChain(
      {
        fields: existing.fields,
        tables: { ...(existing.tables ?? {}), [chain.gaps.key]: gapRows },
      },
      schema,
    ),
    gapCount: gapRows.length,
  };
}

export function buildAppraisalSummary(appraisal: Record<string, unknown>): PipAppraisalSummary {
  const raw = appraisal.final_quarter_score;
  const score =
    typeof raw === "number" ? raw : raw != null && raw !== "" ? Number(raw) : null;
  const parsedScore = score != null && Number.isFinite(score) ? score : null;

  const weak_items = extractWeakItemsFromAppraisal(
    {
      supervisor_ratings: appraisal.supervisor_ratings as Ratings | null,
      employee_ratings: appraisal.employee_ratings as Ratings | null,
      improvement_areas: appraisal.improvement_areas as string | null,
    },
    null,
  );

  return {
    id: String(appraisal.id),
    review_quarter: String(appraisal.review_quarter ?? ""),
    review_year: Number(appraisal.review_year ?? 0),
    employee_name: String(appraisal.employee_name ?? ""),
    final_quarter_score: parsedScore,
    score_band: parsedScore != null ? bandLabel(parsedScore) : "—",
    improvement_areas: (appraisal.improvement_areas as string | null) ?? null,
    strengths_observed: (appraisal.strengths_observed as string | null) ?? null,
    weak_items,
  };
}

export function addGapRowWithChain(
  tables: Record<string, Array<Record<string, string | number | null>>>,
  chain: PipGapChainSections,
  gapsSection: PipTableSection,
): Record<string, Array<Record<string, string | number | null>>> {
  const gapId = newGapId();
  const newGapRow = {
    ...Object.fromEntries(gapsSection.columns.map((c) => [c.key, ""])),
    [PIP_GAP_ID_KEY]: gapId,
  };
  const next = {
    ...tables,
    [gapsSection.key]: [...(tables[gapsSection.key] ?? []), newGapRow],
  };
  return syncGapChainTables(next, chain);
}

export function removeGapRowWithChain(
  tables: Record<string, Array<Record<string, string | number | null>>>,
  chain: PipGapChainSections,
  gapsSection: PipTableSection,
  rowIndex: number,
): Record<string, Array<Record<string, string | number | null>>> {
  const gapRows = [...(tables[gapsSection.key] ?? [])];
  gapRows.splice(rowIndex, 1);
  const next = { ...tables, [gapsSection.key]: gapRows };
  return syncGapChainTables(next, chain);
}

export function addSupportRowForGap(
  tables: Record<string, Array<Record<string, string | number | null>>>,
  chain: PipGapChainSections,
  gapId: string,
): Record<string, Array<Record<string, string | number | null>>> {
  if (!chain.support || !chain.gaps) return tables;
  const label = gapLabelForId(gapId, tables, chain.gaps);
  return {
    ...tables,
    [chain.support.key]: [
      ...(tables[chain.support.key] ?? []),
      prefilledSupportRow(chain.support, gapId, label),
    ],
  };
}
