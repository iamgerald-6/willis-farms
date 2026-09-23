import type { PipFormSchema, PipSection, PipTableColumn, PipTableSection } from "./pipFormSchema";
import { detectPipSectionRole, type PipSectionRole, PIP_GAP_ID_KEY } from "./pipGapChain";
import type { PipFormResponses } from "./pipInstances";

export const PIP_FREQUENCY_OPTIONS = [
  "Daily",
  "Weekly",
  "Bi-Weekly",
  "Monthly",
  "Annually",
] as const;

export type PipFrequency = (typeof PIP_FREQUENCY_OPTIONS)[number];

export const PIP_PROVIDED_BY_OTHER = "Other";

export const PIP_SUPPORT_COLUMN_KEYS = {
  providedBy: "provided_by",
  providedByOther: "provided_by_other",
  objective: "objective",
  startDate: "start_date",
  endDate: "end_date",
  frequency: "frequency",
} as const;

/** @deprecated Use PIP_COACHING_COLUMN_KEYS.date */
export const PIP_COACHING_SESSION_DATE_KEY = "session_date";
/** @deprecated Use PIP_COACHING_COLUMN_KEYS.progressRating */
export const PIP_COACHING_NOTES_KEY = "session_notes";

/** Same 1–5 scale as supervisor appraisal item ratings. */
export const PIP_PROGRESS_RATING_OPTIONS = ["1", "2", "3", "4", "5"] as const;

export const PIP_COACHING_COLUMN_KEYS = {
  week: "week",
  date: "session_date",
  coachedObserved: "coached_observed",
  progressRating: "progress_rating",
  initials: "initials",
} as const;

export const PIP_COACHING_LOG_COLUMNS: Array<{
  key: string;
  label: string;
  type: PipTableColumn["type"];
  options?: string[];
}> = [
  { key: PIP_COACHING_COLUMN_KEYS.week, label: "Week", type: "text" },
  { key: PIP_COACHING_COLUMN_KEYS.date, label: "Date", type: "date" },
  {
    key: PIP_COACHING_COLUMN_KEYS.coachedObserved,
    label: "What was coached / observed",
    type: "textarea",
  },
  {
    key: PIP_COACHING_COLUMN_KEYS.progressRating,
    label: "Progress Rating",
    type: "select",
    options: [...PIP_PROGRESS_RATING_OPTIONS],
  },
  { key: PIP_COACHING_COLUMN_KEYS.initials, label: "Initials (Emp / Sup)", type: "text" },
];

export type PipFormMeta = {
  plan_submitted_at?: string | null;
  selected_coaching_gap_id?: string | null;
  selected_final_outcome_gap_id?: string | null;
  /** @deprecated Use per-gap keys via pipGapMetaKey instead. */
  final_outcome_recorded_at?: string | null;
  /** @deprecated Use per-gap keys via pipGapMetaKey instead. */
  final_outcome_recorded_by?: string | null;
  [key: string]: string | null | undefined;
};

function norm(s: string): string {
  return s.toLowerCase().trim();
}

export function getPipFormMeta(responses: PipFormResponses | null | undefined): PipFormMeta {
  return (responses?.meta ?? {}) as PipFormMeta;
}

export function isPipPlanSubmitted(
  responses: PipFormResponses | null | undefined,
  status?: string | null,
): boolean {
  if (!!getPipFormMeta(responses).plan_submitted_at?.trim()) return true;
  return status === "active" || status === "completed";
}

/** Stage 1 (plan) editable while draft and plan not yet submitted. */
export function isPipStage1Editable(
  status: string | null | undefined,
  responses: PipFormResponses | null | undefined,
): boolean {
  if (status === "completed") return false;
  return (status === "draft" || status == null) && !isPipPlanSubmitted(responses, status);
}

/** Stage 2 (coaching log + below) editable while active after plan submit. */
export function isPipStage2Editable(
  status: string | null | undefined,
  responses: PipFormResponses | null | undefined,
): boolean {
  return status === "active" && isPipPlanSubmitted(responses, status);
}

/** Stage 3 (final outcome) editable under the same rules as tracking. */
export function isPipStage3Editable(
  status: string | null | undefined,
  responses: PipFormResponses | null | undefined,
): boolean {
  return isPipStage2Editable(status, responses);
}

export function isPipFullyLocked(status: string | null | undefined): boolean {
  return status === "completed";
}

/** Display label for the period column (Week, Day, Month, etc.) from plan frequency. */
export function coachingLogPeriodColumnLabel(frequency: string | null | undefined): string {
  const f = (frequency ?? "Weekly").trim();
  if (f === "Daily") return "Day";
  if (f === "Bi-Weekly") return "Bi-Week";
  if (f === "Monthly") return "Month";
  if (f === "Annually") return "Year";
  return "Week";
}

/** Support type phrasing for log titles — e.g. Refreshers → Refresher. */
export function formatSupportTypeForLogTitle(supportAction: string | null | undefined): string {
  const s = (supportAction ?? "Coaching").trim();
  if (!s) return "Coaching";
  if (/^refreshers$/i.test(s)) return "Refresher";
  if (/^system fixes$/i.test(s)) return "System fix";
  if (/^resources$/i.test(s)) return "Resource";
  return s;
}

/** e.g. "Weekly Training log", "Daily Refresher log" */
export function coachingLogTitle(
  frequency: string | null | undefined,
  supportAction?: string | null,
): string {
  const f = (frequency ?? "Weekly").trim();
  const support = formatSupportTypeForLogTitle(supportAction);
  return `${f} ${support} log`;
}

export function coachingLogTitleForGap(
  supportSection: PipTableSection,
  tables: Record<string, Array<Record<string, string | number | null>>>,
  gapId: string | null | undefined,
  fallback = "Session log",
): string {
  if (!gapId?.trim()) return fallback;
  const row = (tables[supportSection.key] ?? []).find(
    (r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId,
  );
  if (!row) return fallback;
  const plan = readSupportPlanRow(row, supportSection);
  return coachingLogTitle(plan.frequency, plan.supportAction);
}

export function isObjectivesSection(section: PipSection): boolean {
  return section.kind === "table" && detectPipSectionRole(section) === "objectives";
}

export function isCoachingSection(section: PipSection): boolean {
  return section.kind === "table" && detectPipSectionRole(section) === "coaching";
}

/** Part 2–5 plan sections (excludes standalone objectives — merged into support). */
export function isStage1Section(section: PipSection): boolean {
  if (isObjectivesSection(section)) return false;
  const role = detectPipSectionRole(section);
  if (role === "gaps" || role === "root_cause" || role === "support") return true;
  if (section.kind === "fields") {
    const t = norm(section.title);
    if (/employee|plan detail|pip detail/.test(t)) return true;
  }
  return false;
}

/** Part 6–9 — coaching log through employee comments (tracking). */
export function isStage2Section(section: PipSection): boolean {
  if (isObjectivesSection(section)) return false;
  const role = detectPipSectionRole(section);
  if (role === "coaching") return true;
  if (role === "reviews" || role === "competency" || role === "employee_comments") return true;
  return false;
}

/** Part 10+ — final outcome, acknowledgements, HR-only closure. */
export function isStage3Section(section: PipSection): boolean {
  if (isObjectivesSection(section)) return false;
  const role = detectPipSectionRole(section);
  return role === "outcome" || role === "signatures" || role === "hr_only";
}

function findColumnByKeyOrLabel(
  section: PipTableSection,
  key: string,
  labelPattern: RegExp,
): PipTableColumn | undefined {
  return (
    section.columns.find((c) => c.key === key) ??
    section.columns.find((c) => labelPattern.test(norm(c.label)))
  );
}

export function findSupportPlanColumns(supportSection: PipTableSection) {
  return {
    providedBy: findColumnByKeyOrLabel(
      supportSection,
      PIP_SUPPORT_COLUMN_KEYS.providedBy,
      /provided by/,
    ),
    providedByOther: findColumnByKeyOrLabel(
      supportSection,
      PIP_SUPPORT_COLUMN_KEYS.providedByOther,
      /provided by.*other|other.*provider|specify.*provider/,
    ),
    objective: findColumnByKeyOrLabel(
      supportSection,
      PIP_SUPPORT_COLUMN_KEYS.objective,
      /objective|smart|goal|target/,
    ),
    startDate: findColumnByKeyOrLabel(
      supportSection,
      PIP_SUPPORT_COLUMN_KEYS.startDate,
      /start date|commenced|from date/,
    ),
    endDate: findColumnByKeyOrLabel(
      supportSection,
      PIP_SUPPORT_COLUMN_KEYS.endDate,
      /end date|target date|to date|deadline/,
    ),
    frequency: findColumnByKeyOrLabel(
      supportSection,
      PIP_SUPPORT_COLUMN_KEYS.frequency,
      /frequency|cadence|interval/,
    ),
  };
}

/** Legacy single deadline column — replaced by Start date + End date. */
export function isLegacyByWhenColumn(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    column.key === "by_when" ||
    column.key === "byWhen" ||
    /^by when$/.test(l) ||
    /\bby when\b/.test(l)
  );
}

/** Drop deprecated support-table columns superseded by the Stage 1 plan fields. */
export function stripLegacySupportColumns(section: PipTableSection): PipTableSection {
  return {
    ...section,
    columns: section.columns.filter((c) => !isLegacyByWhenColumn(c)),
  };
}

/** Inject standard Part 5 plan columns when missing from a published template. */
export function ensureSupportPlanColumns(section: PipTableSection): PipTableSection {
  const cols = [...section.columns];
  const has = (key: string, pattern: RegExp) =>
    cols.some((c) => c.key === key || pattern.test(norm(c.label)));

  const add = (key: string, label: string, type: PipTableColumn["type"], options?: string[]) => {
    if (has(key, new RegExp(norm(label)))) return;
    cols.push({ key, label, type, ...(options ? { options } : {}) });
  };

  add(PIP_SUPPORT_COLUMN_KEYS.providedBy, "Provided by", "select");
  add(PIP_SUPPORT_COLUMN_KEYS.providedByOther, "Provider name (if Other)", "text");
  add(PIP_SUPPORT_COLUMN_KEYS.objective, "Objective", "textarea");
  add(PIP_SUPPORT_COLUMN_KEYS.startDate, "Start date", "date");
  add(PIP_SUPPORT_COLUMN_KEYS.endDate, "End date", "date");
  add(PIP_SUPPORT_COLUMN_KEYS.frequency, "Frequency", "select", [...PIP_FREQUENCY_OPTIONS]);

  return { ...section, columns: cols };
}

function resolveCoachingColumnKey(
  existing: PipTableColumn[],
  standardKey: string,
  labelPattern: RegExp,
): string {
  const match = existing.find((c) => c.key === standardKey || labelPattern.test(norm(c.label)));
  return match?.key ?? standardKey;
}

/** Standard Part 6 coaching log — period, date, coached/observed, progress rating, initials. */
export function ensureCoachingLogColumns(section: PipTableSection): PipTableSection {
  const existing = section.columns;
  const columns: PipTableColumn[] = PIP_COACHING_LOG_COLUMNS.map((col) => {
    const key = resolveCoachingColumnKey(
      existing,
      col.key,
      col.key === PIP_COACHING_COLUMN_KEYS.week
        ? /^week$/
        : col.key === PIP_COACHING_COLUMN_KEYS.date
          ? /^(date|session date)$/
          : col.key === PIP_COACHING_COLUMN_KEYS.coachedObserved
            ? /coached|observed|what was/
            : col.key === PIP_COACHING_COLUMN_KEYS.progressRating
              ? /progress rating|progress note|^progress$|session notes?|notes?|rating/
              : /initials|emp.*sup|supervisor.*employee/,
    );
    return {
      key,
      label: col.label,
      type: col.type,
      ...(col.options?.length ? { options: [...col.options] } : {}),
    };
  });
  return { ...section, columns };
}

export function findCoachingLogColumns(section: PipTableSection) {
  const normalized = ensureCoachingLogColumns(section);
  const byKey = (key: string) => normalized.columns.find((c) => c.key === key);
  return {
    week: byKey(
      resolveCoachingColumnKey(section.columns, PIP_COACHING_COLUMN_KEYS.week, /^week$/),
    ),
    date: byKey(
      resolveCoachingColumnKey(section.columns, PIP_COACHING_COLUMN_KEYS.date, /^(date|session date)$/),
    ),
    coachedObserved: byKey(
      resolveCoachingColumnKey(
        section.columns,
        PIP_COACHING_COLUMN_KEYS.coachedObserved,
        /coached|observed|what was/,
      ),
    ),
    progressRating: byKey(
      resolveCoachingColumnKey(
        section.columns,
        PIP_COACHING_COLUMN_KEYS.progressRating,
        /progress rating|progress note|^progress$|session notes?|notes?|rating/,
      ),
    ),
    initials: byKey(
      resolveCoachingColumnKey(
        section.columns,
        PIP_COACHING_COLUMN_KEYS.initials,
        /initials|emp.*sup|supervisor.*employee/,
      ),
    ),
  };
}

export function isCoachingLogPrefilledColumn(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    column.key === PIP_COACHING_COLUMN_KEYS.week ||
    column.key === PIP_COACHING_COLUMN_KEYS.date ||
    /^week$/.test(l) ||
    /^(date|session date)$/.test(l)
  );
}

export const PIP_REVIEW_COLUMN_KEYS = {
  baselineRating: "baseline_rating",
  progressRating: "review_progress_rating",
} as const;

function isLegacyProgressVsBaselineColumn(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    column.key === "progress_vs_baseline" ||
    /progress.*vs.*baseline|baseline.*vs.*progress|progress versus baseline/.test(l)
  );
}

function isReviewDateColumn(column: PipTableColumn): boolean {
  return (
    column.type === "date" ||
    /review date|session date|week ending|^date$|checkpoint date/.test(norm(column.label))
  );
}

function isReviewStatusColumn(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    (/\bstatus\b/.test(l) && /on track|partial|off track/.test(l)) ||
    /^status$/.test(l)
  );
}

function isBaselineRatingColumnDef(column: PipTableColumn): boolean {
  return (
    column.key === PIP_REVIEW_COLUMN_KEYS.baselineRating || /^baseline rating/.test(norm(column.label))
  );
}

function isReviewProgressRatingColumnDef(column: PipTableColumn): boolean {
  const l = norm(column.label);
  return (
    column.key === PIP_REVIEW_COLUMN_KEYS.progressRating ||
    (/^progress rating/.test(l) && !/vs|versus|baseline/.test(l))
  );
}

/** Formal reviews — baseline/progress immediately after date, before status. */
export function ensureReviewsSectionColumns(section: PipTableSection): PipTableSection {
  const filtered = section.columns.filter((c) => !isLegacyProgressVsBaselineColumn(c));

  const baselineCol =
    filtered.find(isBaselineRatingColumnDef) ??
    ({
      key: PIP_REVIEW_COLUMN_KEYS.baselineRating,
      label: "Baseline rating",
      type: "text",
    } satisfies PipTableColumn);

  const progressCol =
    filtered.find(isReviewProgressRatingColumnDef) ??
    ({
      key: PIP_REVIEW_COLUMN_KEYS.progressRating,
      label: "Progress rating",
      type: "text",
    } satisfies PipTableColumn);

  const middle = filtered.filter(
    (c) => !isBaselineRatingColumnDef(c) && !isReviewProgressRatingColumnDef(c),
  );

  const dateIdx = middle.findIndex(isReviewDateColumn);
  const statusIdx = middle.findIndex(isReviewStatusColumn);
  const insertAt =
    dateIdx >= 0 ? dateIdx + 1 : statusIdx >= 0 ? statusIdx : middle.length;

  const columns = [...middle];
  columns.splice(insertAt, 0, baselineCol, progressCol);

  return { ...section, columns };
}

export function normalizePipSchemaForStages(schema: PipFormSchema): PipFormSchema {
  return {
    ...schema,
    sections: schema.sections
      .filter((s) => !isObjectivesSection(s))
      .map((s) => {
        if (s.kind === "table" && detectPipSectionRole(s) === "support") {
          return ensureSupportPlanColumns(stripLegacySupportColumns(s));
        }
        if (s.kind === "table" && isCoachingSection(s)) {
          return ensureCoachingLogColumns(s);
        }
        if (s.kind === "table" && detectPipSectionRole(s) === "reviews") {
          return ensureReviewsSectionColumns(s);
        }
        return s;
      }),
  };
}

function parseIsoDate(value: unknown): Date | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date in ISO form (UTC slice — consistent with stored session dates). */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizePipScheduleDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10);
}

/** True when the schedule date is today or in the past. */
export function isPipScheduleDateReached(
  scheduleDate: string | null | undefined,
  asOfDate?: string,
): boolean {
  const d = normalizePipScheduleDate(scheduleDate);
  if (!d) return false;
  const today = normalizePipScheduleDate(asOfDate ?? todayIsoDate());
  return d <= today;
}

export function formatPipScheduleDateDisplay(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Rows whose schedule date is today or earlier (hides future-dated rows). */
export function filterRowsWithReachedScheduleDates<
  T extends Record<string, string | number | null>,
>(rows: T[], dateKey: string, asOfDate?: string): T[] {
  return rows.filter((row) => isPipScheduleDateReached(String(row[dateKey] ?? ""), asOfDate));
}

function resolveNextScheduledDateForGap(args: {
  gapRows: Array<Record<string, string | number | null>>;
  dateKey: string;
  planStartDate: string;
  planEndDate: string;
  frequency: string;
  effectiveEndDate?: string | null;
}): string | null {
  const { gapRows, dateKey, planStartDate, planEndDate, frequency, effectiveEndDate } = args;
  const endDate = String(effectiveEndDate ?? "").trim() || planEndDate;
  const lastDate =
    gapRows.length > 0
      ? String(gapRows[gapRows.length - 1]![dateKey] ?? "")
      : "";
  if (lastDate) {
    return getNextSessionDate(lastDate, frequency, endDate);
  }
  return getFirstSessionDate(planStartDate, endDate, frequency);
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

/** First schedulable session date for a plan row. */
export function getFirstSessionDate(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  frequency: string | null | undefined,
): string | null {
  const dates = generateCoachingSessionDates(startDate, endDate, frequency);
  return dates[0] ?? null;
}

/** Next session/review date after `afterDate`, respecting plan end and frequency. */
export function getNextSessionDate(
  afterDate: string | null | undefined,
  frequency: string | null | undefined,
  endDate: string | null | undefined,
): string | null {
  const anchor = String(afterDate ?? "").trim();
  if (!anchor) return null;
  const dates = generateCoachingSessionDates(anchor, endDate, frequency);
  return dates.length >= 2 ? dates[1]! : null;
}

/** Build session dates from Part 5 plan row. */
export function generateCoachingSessionDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  frequency: string | null | undefined,
): string[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return [];

  const freq = (frequency ?? "Weekly").trim();
  const dates: string[] = [];
  let cursor = new Date(start);
  const maxSessions = 366;

  while (cursor <= end && dates.length < maxSessions) {
    dates.push(formatIsoDate(cursor));
    if (freq === "Daily") cursor = addDays(cursor, 1);
    else if (freq === "Weekly") cursor = addDays(cursor, 7);
    else if (freq === "Bi-Weekly") cursor = addDays(cursor, 14);
    else if (freq === "Monthly") cursor = addMonths(cursor, 1);
    else if (freq === "Annually") cursor = addMonths(cursor, 12);
    else cursor = addDays(cursor, 7);
  }

  return dates;
}

export function readSupportPlanRow(
  row: Record<string, string | number | null>,
  supportSection: PipTableSection,
) {
  const cols = findSupportPlanColumns(supportSection);
  const read = (col?: PipTableColumn) =>
    col ? String(row[col.key] ?? "").trim() : "";

  return {
    providedBy: read(cols.providedBy),
    providedByOther: read(cols.providedByOther),
    objective: read(cols.objective),
    startDate: read(cols.startDate),
    endDate: read(cols.endDate),
    frequency: read(cols.frequency) || "Weekly",
    supportAction: read(
      supportSection.columns.find((c) =>
        /support action|type of support|support type|intervention|development action/.test(
          norm(c.label),
        ),
      ),
    ),
  };
}

export function validateStage1Plan(
  schema: PipFormSchema,
  responses: PipFormResponses,
): string[] {
  const errors: string[] = [];
  const supportSection = schema.sections.find(
    (s) => s.kind === "table" && detectPipSectionRole(s) === "support",
  ) as PipTableSection | undefined;

  if (!supportSection) return errors;

  const rows = responses.tables?.[supportSection.key] ?? [];
  if (rows.length === 0) {
    errors.push("Add at least one performance gap and support plan row.");
    return errors;
  }

  rows.forEach((row, i) => {
    const plan = readSupportPlanRow(row, supportSection);
    const label = `Gap ${i + 1}`;
    if (!plan.objective) errors.push(`${label}: objective is required.`);
    if (!plan.startDate) errors.push(`${label}: start date is required.`);
    if (!plan.endDate) errors.push(`${label}: end date is required.`);
    if (!plan.frequency) errors.push(`${label}: frequency is required.`);
    if (!plan.providedBy) errors.push(`${label}: provided by is required.`);
    if (
      plan.providedBy === PIP_PROVIDED_BY_OTHER &&
      !plan.providedByOther.trim()
    ) {
      errors.push(`${label}: enter the provider name when "Other" is selected.`);
    }
  });

  return errors;
}

function legacyCoachingDateKey(section: PipTableSection): string {
  const cols = findCoachingLogColumns(section);
  return cols.date?.key ?? PIP_COACHING_COLUMN_KEYS.date;
}

export function normalizeCoachingLogRow(
  row: Record<string, string | number | null>,
  section: PipTableSection,
): Record<string, string | number | null> {
  const cols = findCoachingLogColumns(ensureCoachingLogColumns(section));
  return migrateLegacyCoachingRow(row, cols);
}

function isValidProgressRating(value: unknown): boolean {
  return PIP_PROGRESS_RATING_OPTIONS.includes(String(value ?? "").trim() as (typeof PIP_PROGRESS_RATING_OPTIONS)[number]);
}

function migrateLegacyCoachingRow(
  row: Record<string, string | number | null>,
  cols: ReturnType<typeof findCoachingLogColumns>,
): Record<string, string | number | null> {
  const next = { ...row };
  const ratingKey = cols.progressRating?.key ?? PIP_COACHING_COLUMN_KEYS.progressRating;
  if (!isValidProgressRating(next[ratingKey])) {
    const legacyCandidates = [
      row[ratingKey],
      row.progress_note,
      row[PIP_COACHING_NOTES_KEY],
      row.session_notes,
      row.notes,
      row.progress,
    ];
    for (const legacy of legacyCandidates) {
      if (isValidProgressRating(legacy)) {
        next[ratingKey] = String(legacy).trim();
        break;
      }
    }
  }
  return next;
}

function buildCoachingSessionRow(
  coachingSection: PipTableSection,
  gapId: string,
  sessionDate: string,
  periodIndex: number,
  seed?: Record<string, string | number | null>,
): Record<string, string | number | null> {
  const normalizedSection = ensureCoachingLogColumns(coachingSection);
  const cols = findCoachingLogColumns(normalizedSection);
  const weekKey = cols.week?.key ?? PIP_COACHING_COLUMN_KEYS.week;
  const dateKey = legacyCoachingDateKey(normalizedSection);

  const base = Object.fromEntries(
    normalizedSection.columns.map((c) => [c.key, seed?.[c.key] ?? ""]),
  ) as Record<string, string | number | null>;
  base[PIP_GAP_ID_KEY] = gapId;
  base[weekKey] = String(periodIndex);
  base[dateKey] = sessionDate;
  return migrateLegacyCoachingRow(base, cols);
}

/** Seed one coaching session row per gap (plan start date). */
export function initCoachingRowsForGap(
  coachingSection: PipTableSection,
  supportSection: PipTableSection,
  supportRow: Record<string, string | number | null>,
  existingRows: Array<Record<string, string | number | null>>,
): Array<Record<string, string | number | null>> {
  const gapId = String(supportRow[PIP_GAP_ID_KEY] ?? "").trim();
  if (!gapId) return existingRows;

  const plan = readSupportPlanRow(supportRow, supportSection);
  const firstDate = getFirstSessionDate(plan.startDate, plan.endDate, plan.frequency);
  if (!firstDate || !isPipScheduleDateReached(firstDate)) {
    return existingRows.filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") !== gapId);
  }

  const normalizedSection = ensureCoachingLogColumns(coachingSection);
  const dateKey = legacyCoachingDateKey(normalizedSection);
  const otherGapRows = existingRows.filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") !== gapId);
  const prevFirst = existingRows
    .filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId)
    .sort((a, b) => String(a[dateKey] ?? "").localeCompare(String(b[dateKey] ?? "")))[0];
  return [
    ...otherGapRows,
    buildCoachingSessionRow(coachingSection, gapId, firstDate, 1, prevFirst),
  ];
}

function coachingRowHasUserContent(
  row: Record<string, string | number | null>,
  coachingSection: PipTableSection,
): boolean {
  const cols = findCoachingLogColumns(ensureCoachingLogColumns(coachingSection));
  for (const key of [
    cols.coachedObserved?.key,
    cols.progressRating?.key,
    cols.initials?.key,
  ]) {
    if (key && String(row[key] ?? "").trim()) return true;
  }
  return false;
}

function isLegacyBulkSchedule(
  actualDates: string[],
  expectedDates: string[],
): boolean {
  return (
    expectedDates.length > 1 &&
    actualDates.length === expectedDates.length &&
    actualDates.every((d, i) => d === expectedDates[i])
  );
}

/** Empty rows above this count per gap are treated as legacy auto-generated schedules. */
const LEGACY_BULK_ROW_THRESHOLD = 4;

function shouldCollapseToFirstSessionRow(
  gapRows: Array<Record<string, string | number | null>>,
  expectedDates: string[],
  hasUserContent: boolean,
  dateKey: string,
): boolean {
  if (gapRows.length <= 1 || hasUserContent) return false;
  const actualDates = gapRows.map((r) => String(r[dateKey] ?? "").slice(0, 10));
  return (
    isLegacyBulkSchedule(actualDates, expectedDates) ||
    gapRows.length === expectedDates.length ||
    gapRows.length > LEGACY_BULK_ROW_THRESHOLD
  );
}

/** Collapse pre-generated full-schedule coaching rows down to the first session. */
export function migrateLegacyBulkCoachingRows(
  coachingSection: PipTableSection,
  supportSection: PipTableSection,
  supportRows: Array<Record<string, string | number | null>>,
  coachingRows: Array<Record<string, string | number | null>>,
): Array<Record<string, string | number | null>> {
  const normalizedSection = ensureCoachingLogColumns(coachingSection);
  const dateKey = legacyCoachingDateKey(normalizedSection);
  let next = [...coachingRows];

  for (const supportRow of supportRows) {
    const gapId = String(supportRow[PIP_GAP_ID_KEY] ?? "").trim();
    if (!gapId) continue;

    const plan = readSupportPlanRow(supportRow, supportSection);
    const expected = generateCoachingSessionDates(
      plan.startDate,
      plan.endDate,
      plan.frequency,
    ).map((d) => d.slice(0, 10));

    const gapRows = next
      .filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId)
      .sort((a, b) => String(a[dateKey] ?? "").localeCompare(String(b[dateKey] ?? "")));

    if (gapRows.length <= 1) continue;

    const hasUserContent = gapRows.some((r) => coachingRowHasUserContent(r, coachingSection));

    if (shouldCollapseToFirstSessionRow(gapRows, expected, hasUserContent, dateKey)) {
      next = [...next.filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") !== gapId), gapRows[0]!];
    }
  }

  return next;
}

function reviewRowHasUserContent(
  row: Record<string, string | number | null>,
  reviewsSection: PipTableSection,
): boolean {
  const dateKey = findReviewDateColumnKey(reviewsSection);
  for (const col of reviewsSection.columns) {
    if (isBaselineRatingColumnDef(col) || isReviewProgressRatingColumnDef(col)) continue;
    if (dateKey && col.key === dateKey) continue;
    if (String(row[col.key] ?? "").trim()) return true;
  }
  return false;
}

/** Collapse pre-generated full-schedule review rows down to the first review. */
export function migrateLegacyBulkReviewRows(
  reviewsSection: PipTableSection,
  supportSection: PipTableSection,
  supportRows: Array<Record<string, string | number | null>>,
  reviewRows: Array<Record<string, string | number | null>>,
): Array<Record<string, string | number | null>> {
  const normalizedSection = ensureReviewsSectionColumns(reviewsSection);
  const dateKey = findReviewDateColumnKey(normalizedSection);
  if (!dateKey) return reviewRows;

  let next = [...reviewRows];

  for (const supportRow of supportRows) {
    const gapId = String(supportRow[PIP_GAP_ID_KEY] ?? "").trim();
    if (!gapId) continue;

    const plan = readSupportPlanRow(supportRow, supportSection);
    const expected = generateCoachingSessionDates(
      plan.startDate,
      plan.endDate,
      plan.frequency,
    ).map((d) => d.slice(0, 10));

    const gapRows = next
      .filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId)
      .sort((a, b) => String(a[dateKey] ?? "").localeCompare(String(b[dateKey] ?? "")));

    if (gapRows.length <= 1) continue;

    const hasUserContent = gapRows.some((r) => reviewRowHasUserContent(r, normalizedSection));

    if (shouldCollapseToFirstSessionRow(gapRows, expected, hasUserContent, dateKey)) {
      next = [...next.filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") !== gapId), gapRows[0]!];
    }
  }

  return next;
}

/** Normalize tracking tables after plan submit — one row per gap, migrate legacy bulk schedules. */
export function normalizePipTrackingResponses(
  schema: PipFormSchema,
  responses: PipFormResponses,
): PipFormResponses {
  if (!isPipPlanSubmitted(responses)) return responses;

  const coachingSection = schema.sections.find(isCoachingSection) as PipTableSection | undefined;
  const supportSection = schema.sections.find(
    (s) => s.kind === "table" && detectPipSectionRole(s) === "support",
  ) as PipTableSection | undefined;
  const reviewsSection = schema.sections.find(
    (s) => s.kind === "table" && detectPipSectionRole(s) === "reviews",
  ) as PipTableSection | undefined;

  if (!supportSection) return responses;

  const supportRows = responses.tables?.[supportSection.key] ?? [];
  const tables = { ...(responses.tables ?? {}) };

  if (coachingSection) {
    let coachingRows = tables[coachingSection.key] ?? [];
    coachingRows = migrateLegacyBulkCoachingRows(
      coachingSection,
      supportSection,
      supportRows,
      coachingRows,
    );
    for (const supportRow of supportRows) {
      const gapId = String(supportRow[PIP_GAP_ID_KEY] ?? "").trim();
      if (!gapId) continue;
      const hasRows = coachingRows.some((r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId);
      if (!hasRows) {
        coachingRows = initCoachingRowsForGap(
          coachingSection,
          supportSection,
          supportRow,
          coachingRows,
        );
      }
    }
    tables[coachingSection.key] = coachingRows;
  }

  if (reviewsSection) {
    const normalizedReviews = ensureReviewsSectionColumns(reviewsSection);
    let reviewRows = tables[reviewsSection.key] ?? [];
    reviewRows = migrateLegacyBulkReviewRows(
      normalizedReviews,
      supportSection,
      supportRows,
      reviewRows,
    );
    for (const supportRow of supportRows) {
      const gapId = String(supportRow[PIP_GAP_ID_KEY] ?? "").trim();
      if (!gapId) continue;
      const hasRows = reviewRows.some((r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId);
      if (!hasRows) {
        reviewRows = initFormalReviewRowsForGap(
          normalizedReviews,
          supportSection,
          supportRow,
          reviewRows,
        );
      }
    }
    tables[reviewsSection.key] = reviewRows;
  }

  return { ...responses, tables };
}

/** Next coaching session date for a gap (first or following the last row). */
export function resolveNextCoachingSessionDate(
  coachingSection: PipTableSection,
  supportSection: PipTableSection,
  supportRow: Record<string, string | number | null>,
  existingRows: Array<Record<string, string | number | null>>,
  effectiveEndDate?: string | null,
): string | null {
  const gapId = String(supportRow[PIP_GAP_ID_KEY] ?? "").trim();
  if (!gapId) return null;

  const normalizedSection = ensureCoachingLogColumns(coachingSection);
  const dateKey = legacyCoachingDateKey(normalizedSection);
  const plan = readSupportPlanRow(supportRow, supportSection);
  const gapRows = existingRows
    .filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId)
    .sort((a, b) => String(a[dateKey] ?? "").localeCompare(String(b[dateKey] ?? "")));

  return resolveNextScheduledDateForGap({
    gapRows,
    dateKey,
    planStartDate: plan.startDate,
    planEndDate: plan.endDate,
    frequency: plan.frequency,
    effectiveEndDate,
  });
}

/** Append the next coaching session when its schedule date has been reached. */
export function appendCoachingSessionRow(
  coachingSection: PipTableSection,
  supportSection: PipTableSection,
  supportRow: Record<string, string | number | null>,
  existingRows: Array<Record<string, string | number | null>>,
  effectiveEndDate?: string | null,
): { rows: Array<Record<string, string | number | null>>; added: boolean } {
  const gapId = String(supportRow[PIP_GAP_ID_KEY] ?? "").trim();
  if (!gapId) return { rows: existingRows, added: false };

  const nextDate = resolveNextCoachingSessionDate(
    coachingSection,
    supportSection,
    supportRow,
    existingRows,
    effectiveEndDate,
  );
  if (!nextDate || !isPipScheduleDateReached(nextDate)) {
    return { rows: existingRows, added: false };
  }

  const normalizedSection = ensureCoachingLogColumns(coachingSection);
  const dateKey = legacyCoachingDateKey(normalizedSection);
  const gapRows = existingRows
    .filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId)
    .sort((a, b) => String(a[dateKey] ?? "").localeCompare(String(b[dateKey] ?? "")));

  const newRow = buildCoachingSessionRow(
    coachingSection,
    gapId,
    nextDate,
    gapRows.length + 1,
  );
  return { rows: [...existingRows, newRow], added: true };
}

/** Whether the next coaching session date has arrived and is before plan end. */
export function canAppendCoachingSessionRow(
  coachingSection: PipTableSection,
  supportSection: PipTableSection,
  supportRow: Record<string, string | number | null>,
  existingRows: Array<Record<string, string | number | null>>,
  effectiveEndDate?: string | null,
): boolean {
  const nextDate = resolveNextCoachingSessionDate(
    coachingSection,
    supportSection,
    supportRow,
    existingRows,
    effectiveEndDate,
  );
  return !!nextDate && isPipScheduleDateReached(nextDate);
}

function findReviewDateColumnKey(section: PipTableSection): string | undefined {
  const col =
    section.columns.find((c) => c.type === "date") ??
    section.columns.find((c) =>
      /review date|session date|week ending|^date$|checkpoint date|assessment date|practical date|observation date|date of assessment/.test(
        norm(c.label),
      ),
    );
  return col?.key;
}

/** Append a practical/competency assessment row with today's date prefilled. */
export function appendCompetencyAssessmentRow(
  section: PipTableSection,
  existingRows: Array<Record<string, string | number | null>>,
): Array<Record<string, string | number | null>> {
  const row = Object.fromEntries(
    section.columns.map((c) => [c.key, ""]),
  ) as Record<string, string | number | null>;
  const dateKey = findReviewDateColumnKey(section);
  if (dateKey) {
    row[dateKey] = new Date().toISOString().slice(0, 10);
  }
  return [...existingRows, row];
}

function buildFormalReviewRow(
  reviewsSection: PipTableSection,
  gapId: string,
  reviewDate: string,
  seed?: Record<string, string | number | null>,
): Record<string, string | number | null> {
  const row = Object.fromEntries(
    reviewsSection.columns.map((c) => [c.key, seed?.[c.key] ?? ""]),
  ) as Record<string, string | number | null>;
  row[PIP_GAP_ID_KEY] = gapId;
  const dateKey = findReviewDateColumnKey(reviewsSection);
  if (dateKey) row[dateKey] = reviewDate;
  return row;
}

/** Seed one formal review row per gap (plan start date). */
export function initFormalReviewRowsForGap(
  reviewsSection: PipTableSection,
  supportSection: PipTableSection,
  supportRow: Record<string, string | number | null>,
  existingRows: Array<Record<string, string | number | null>>,
): Array<Record<string, string | number | null>> {
  const gapId = String(supportRow[PIP_GAP_ID_KEY] ?? "").trim();
  if (!gapId) return existingRows;

  const plan = readSupportPlanRow(supportRow, supportSection);
  const firstDate = getFirstSessionDate(plan.startDate, plan.endDate, plan.frequency);
  if (!firstDate || !isPipScheduleDateReached(firstDate)) {
    return existingRows.filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") !== gapId);
  }

  const otherGapRows = existingRows.filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") !== gapId);
  const prevFirst = existingRows.find((r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId);
  return [
    ...otherGapRows,
    buildFormalReviewRow(reviewsSection, gapId, firstDate, prevFirst),
  ];
}

/** Next formal review date for a gap (first or following the last row). */
export function resolveNextFormalReviewDate(
  reviewsSection: PipTableSection,
  supportSection: PipTableSection,
  supportRow: Record<string, string | number | null>,
  existingRows: Array<Record<string, string | number | null>>,
  effectiveEndDate?: string | null,
): string | null {
  const gapId = String(supportRow[PIP_GAP_ID_KEY] ?? "").trim();
  if (!gapId) return null;

  const dateKey = findReviewDateColumnKey(reviewsSection);
  if (!dateKey) return null;

  const plan = readSupportPlanRow(supportRow, supportSection);
  const gapRows = existingRows
    .filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === gapId)
    .sort((a, b) => String(a[dateKey] ?? "").localeCompare(String(b[dateKey] ?? "")));

  return resolveNextScheduledDateForGap({
    gapRows,
    dateKey,
    planStartDate: plan.startDate,
    planEndDate: plan.endDate,
    frequency: plan.frequency,
    effectiveEndDate,
  });
}

/** Append the next formal review row when its schedule date has been reached. */
export function appendFormalReviewRow(
  reviewsSection: PipTableSection,
  supportSection: PipTableSection,
  supportRow: Record<string, string | number | null>,
  existingRows: Array<Record<string, string | number | null>>,
  effectiveEndDate?: string | null,
): { rows: Array<Record<string, string | number | null>>; added: boolean } {
  const gapId = String(supportRow[PIP_GAP_ID_KEY] ?? "").trim();
  if (!gapId) return { rows: existingRows, added: false };

  const nextDate = resolveNextFormalReviewDate(
    reviewsSection,
    supportSection,
    supportRow,
    existingRows,
    effectiveEndDate,
  );
  if (!nextDate || !isPipScheduleDateReached(nextDate)) {
    return { rows: existingRows, added: false };
  }

  const newRow = buildFormalReviewRow(reviewsSection, gapId, nextDate);
  return { rows: [...existingRows, newRow], added: true };
}

/** Whether the next formal review date has arrived and is before plan end. */
export function canAppendFormalReviewRow(
  reviewsSection: PipTableSection,
  supportSection: PipTableSection,
  supportRow: Record<string, string | number | null>,
  existingRows: Array<Record<string, string | number | null>>,
  effectiveEndDate?: string | null,
): boolean {
  const nextDate = resolveNextFormalReviewDate(
    reviewsSection,
    supportSection,
    supportRow,
    existingRows,
    effectiveEndDate,
  );
  return !!nextDate && isPipScheduleDateReached(nextDate);
}

export function syncAllCoachingLogs(
  schema: PipFormSchema,
  responses: PipFormResponses,
): PipFormResponses {
  const coachingSection = schema.sections.find(isCoachingSection) as PipTableSection | undefined;
  const supportSection = schema.sections.find(
    (s) => s.kind === "table" && detectPipSectionRole(s) === "support",
  ) as PipTableSection | undefined;

  if (!coachingSection || !supportSection) return responses;

  const supportRows = responses.tables?.[supportSection.key] ?? [];
  let coachingRows = migrateLegacyBulkCoachingRows(
    coachingSection,
    supportSection,
    supportRows,
    responses.tables?.[coachingSection.key] ?? [],
  );

  for (const supportRow of supportRows) {
    coachingRows = initCoachingRowsForGap(
      coachingSection,
      supportSection,
      supportRow,
      coachingRows,
    );
  }

  const reviewsSection = schema.sections.find(
    (s) => s.kind === "table" && detectPipSectionRole(s) === "reviews",
  ) as PipTableSection | undefined;

  let reviewRows = responses.tables?.[reviewsSection?.key ?? ""] ?? [];
  if (reviewsSection) {
    const normalizedReviews = ensureReviewsSectionColumns(reviewsSection);
    reviewRows = migrateLegacyBulkReviewRows(
      normalizedReviews,
      supportSection,
      supportRows,
      reviewRows,
    );
    for (const supportRow of supportRows) {
      reviewRows = initFormalReviewRowsForGap(
        normalizedReviews,
        supportSection,
        supportRow,
        reviewRows,
      );
    }
  }

  return {
    ...responses,
    tables: {
      ...(responses.tables ?? {}),
      [coachingSection.key]: coachingRows,
      ...(reviewsSection ? { [reviewsSection.key]: reviewRows } : {}),
    },
  };
}

export function applySupportPlanDefaults(
  schema: PipFormSchema,
  responses: PipFormResponses,
  supervisorName: string,
): PipFormResponses {
  const supportSection = schema.sections.find(
    (s) => s.kind === "table" && detectPipSectionRole(s) === "support",
  ) as PipTableSection | undefined;
  if (!supportSection) return responses;

  const cols = findSupportPlanColumns(supportSection);
  const rows = (responses.tables?.[supportSection.key] ?? []).map((row) => {
    const next = { ...row };
    if (cols.providedBy && !String(next[cols.providedBy.key] ?? "").trim()) {
      next[cols.providedBy.key] = supervisorName.trim() || "";
    }
    if (cols.frequency && !String(next[cols.frequency.key] ?? "").trim()) {
      next[cols.frequency.key] = "Weekly";
    }
    return next;
  });

  return {
    ...responses,
    tables: { ...(responses.tables ?? {}), [supportSection.key]: rows },
  };
}

export function collectStage1SectionKeys(schema: PipFormSchema): Set<string> {
  const keys = new Set<string>();
  for (const section of schema.sections) {
    if (isStage1Section(section)) keys.add(section.key);
  }
  return keys;
}

/** Strip Stage 1 edits from payload when plan is already submitted. */
export function stripStage1Edits(
  schema: PipFormSchema,
  incoming: PipFormResponses,
  baseline: PipFormResponses,
): PipFormResponses {
  const stage1Keys = collectStage1SectionKeys(schema);
  const tables = { ...(incoming.tables ?? {}) };
  for (const key of stage1Keys) {
    if (baseline.tables?.[key]) tables[key] = baseline.tables[key]!;
  }

  const fields = { ...(incoming.fields ?? {}) };
  for (const section of schema.sections) {
    if (section.kind !== "fields" || !stage1Keys.has(section.key)) continue;
    for (const field of section.fields) {
      if (baseline.fields && field.key in baseline.fields) {
        fields[field.key] = baseline.fields[field.key] ?? null;
      }
    }
  }

  return { ...incoming, fields, tables, meta: incoming.meta ?? baseline.meta };
}
