/**
 * Shape of a Performance Improvement Plan (PIP) form, as extracted from an
 * HR-uploaded document (see POST /api/appraisal/pip-templates/extract) or
 * built by hand, and stored on pip_form_template_versions.form_schema (see
 * docs/appraisal/pip-form-templates.sql).
 *
 * Deliberately NOT a generic form builder: every PIP has the same overall
 * shape as the uploaded reference document (a mix of single-value field
 * groups like "Employee & Plan Details" and repeating tables like "Weekly
 * Coaching Log"). What's dynamic is the *content* HR sets up — labels,
 * section titles, column headers, select options (e.g. 30/60/90-day
 * duration), and how many sections there are — either by hand ("Add
 * section") or by uploading a document to prefill them ("Prefill with
 * WillsFarms Intel"), same as the appraisal question-set builder.
 *
 * One deliberate exception to "everything is editable": fields that
 * correspond to data the system already tracks (employee name, position,
 * supervisor, ...) are `type: "system"` — locked, not retyped by hand, the
 * same "if the system tracks it, don't make someone retype it" rule used
 * elsewhere in the platform (see docs/PLATFORM_AUDIT_AND_ROADMAP.md §1).
 * These render as read-only rows in the template builder and will be
 * auto-filled from the actual employee/appraisal record once PIP instances
 * exist (Phase 2+) — nothing reads systemSource yet in Phase 1.
 */

export type PipFieldType =
  | "text"
  | "textarea"
  | "date"
  | "select"
  | "signature"
  | "number"
  | "system";

/**
 * Fixed catalog of tracked-data sources a `system` field can lock to —
 * matches the identity/placement fields the reference PIP document's
 * "Employee & Plan Details" section asks for. Intentionally a closed list
 * (not free text) so a `system` field always resolves to something a
 * future PIP instance form actually knows how to fill in.
 */
export const PIP_SYSTEM_FIELD_SOURCES = [
  { key: "employee_name", label: "Employee name" },
  { key: "employee_id", label: "Employee ID" },
  { key: "position", label: "Position" },
  { key: "department_and_site", label: "Department / unit & farm site" },
  { key: "supervisor", label: "Supervisor" },
  { key: "hr_facilitator", label: "HR facilitator" },
  { key: "appraisal_period_rating", label: "Appraisal period & rating that triggered this PIP" },
] as const;

export type PipSystemFieldSourceKey = (typeof PIP_SYSTEM_FIELD_SOURCES)[number]["key"];

const SYSTEM_SOURCE_KEYS = new Set<string>(PIP_SYSTEM_FIELD_SOURCES.map((s) => s.key));

export function systemFieldSourceLabel(key: string | null | undefined): string {
  return PIP_SYSTEM_FIELD_SOURCES.find((s) => s.key === key)?.label ?? "Tracked field";
}

export interface RegularPipField {
  key: string;
  label: string;
  type: Exclude<PipFieldType, "system">;
  /** Only meaningful when type === "select". */
  options?: string[];
  helpText?: string | null;
  required?: boolean;
}

/** A field locked to a tracked-data source — see PIP_SYSTEM_FIELD_SOURCES.
 * Not manually relabeled/retyped in the builder; HR can only remove it or
 * add one back from the fixed catalog. */
export interface SystemPipField {
  key: string;
  type: "system";
  systemSource: PipSystemFieldSourceKey;
}

export type PipField = RegularPipField | SystemPipField;

export function isSystemField(field: PipField): field is SystemPipField {
  return field.type === "system";
}

/** Display label for any field — system fields derive theirs from the
 * catalog rather than storing a separately-editable label. */
export function pipFieldLabel(field: PipField): string {
  return isSystemField(field) ? systemFieldSourceLabel(field.systemSource) : field.label;
}

export interface PipTableColumn {
  key: string;
  label: string;
  type?: PipFieldType;
  /** For type === "select" on table columns. */
  options?: string[];
}

/** Who fills / sees a section on a live PIP instance. */
export type PipSectionAudience = "all" | "supervisor" | "hr";

export const PIP_SECTION_AUDIENCE_OPTIONS: {
  value: PipSectionAudience;
  label: string;
}[] = [
  { value: "all", label: "Everyone (employee, supervisor, HR)" },
  { value: "supervisor", label: "Supervisor & HR" },
  { value: "hr", label: "HR only" },
];

const HR_SECTION_TITLE_RE =
  /\b(hr\s*use\s*only|hr\s*only|for\s*hr|human\s*resource|hr\s*review|hr\s*section|hr\s*confidential|hr\s*facilitator)\b/i;

/** Resolve audience — explicit on the section, or inferred from the title. */
export function resolvePipSectionAudience(section: {
  title?: string | null;
  helpText?: string | null;
  audience?: PipSectionAudience | null;
}): PipSectionAudience {
  if (
    section.audience === "all" ||
    section.audience === "supervisor" ||
    section.audience === "hr"
  ) {
    return section.audience;
  }
  const haystack = `${section.title ?? ""} ${section.helpText ?? ""}`;
  if (HR_SECTION_TITLE_RE.test(haystack)) return "hr";
  return "all";
}

export function isPipSectionVisible(
  section: { title?: string | null; helpText?: string | null; audience?: PipSectionAudience | null },
  canViewHrSections: boolean,
): boolean {
  const audience = resolvePipSectionAudience(section);
  if (audience === "hr") return canViewHrSections;
  return true;
}

/** A single-value group of fields, e.g. "1. Employee & Plan Details". */
export interface PipFieldsSection {
  kind: "fields";
  key: string;
  title: string;
  helpText?: string | null;
  audience?: PipSectionAudience | null;
  fields: PipField[];
}

/** A repeating table, e.g. "2. Performance Gaps" or "6. Weekly Coaching
 * Log" — rows are added by whoever fills the PIP out (Phase 2+), not fixed
 * at template time. */
export interface PipTableSection {
  kind: "table";
  key: string;
  title: string;
  helpText?: string | null;
  audience?: PipSectionAudience | null;
  columns: PipTableColumn[];
  /** How many blank rows to start a fresh instance with. */
  minRows: number;
}

export type PipSection = PipFieldsSection | PipTableSection;

export interface PipFormSchema {
  title: string;
  /** Free-text scope/purpose statement shown at the top of the form, e.g.
   * the reference document's "The PIP is a developmental tool, not a
   * disciplinary sanction... " paragraph. */
  intro?: string | null;
  sections: PipSection[];
}

export function createEmptyPipFormSchema(): PipFormSchema {
  return { title: "Performance Improvement Plan", intro: null, sections: [] };
}

const MAX_SECTIONS = 30;
const MAX_FIELDS_PER_SECTION = 40;
const MAX_COLUMNS_PER_TABLE = 12;

const VALID_FIELD_TYPES: readonly PipFieldType[] = [
  "text",
  "textarea",
  "date",
  "select",
  "signature",
  "number",
  "system",
];

/** Field type options for the manual editor's per-field type dropdown —
 * "system" is deliberately excluded here; a system field is added via its
 * own "Add tracked field" control (picking from PIP_SYSTEM_FIELD_SOURCES),
 * never by switching a regular field's type. */
export const PIP_FIELD_TYPE_OPTIONS: { value: Exclude<PipFieldType, "system">; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "date", label: "Date" },
  { value: "select", label: "Choice (select)" },
  { value: "signature", label: "Signature" },
  { value: "number", label: "Number" },
];

let blankKeyCounter = 0;
function blankKey(prefix: string): string {
  blankKeyCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${blankKeyCounter}`;
}

function slugify(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function uniqueKey(base: string, seen: Set<string>): string {
  let key = base;
  let i = 2;
  while (seen.has(key)) {
    key = `${base}_${i}`;
    i += 1;
  }
  seen.add(key);
  return key;
}

/** A fresh, empty section of the given kind — used when HR manually adds a
 * section in the builder. */
export function createBlankPipSection(kind: "fields" | "table"): PipSection {
  if (kind === "table") {
    return {
      kind: "table",
      key: blankKey("section"),
      title: "New section",
      helpText: null,
      columns: [{ key: blankKey("col"), label: "Column 1" }],
      minRows: 1,
    };
  }
  return {
    kind: "fields",
    key: blankKey("section"),
    title: "New section",
    helpText: null,
    fields: [{ key: blankKey("field"), label: "New field", type: "text" }],
  };
}

export function createBlankPipField(): PipField {
  return { key: blankKey("field"), label: "New field", type: "text" };
}

/** A locked field referencing one of the fixed tracked-data sources. */
export function createSystemPipField(source: PipSystemFieldSourceKey): PipField {
  return { key: blankKey("system"), type: "system", systemSource: source };
}

export function createBlankPipColumn(): PipTableColumn {
  return { key: blankKey("col"), label: "New column" };
}

function normalizeField(raw: unknown, index: number, seenKeys: Set<string>): PipField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const rawType = typeof r.type === "string" ? (r.type as string) : "text";
  const type: PipFieldType = (VALID_FIELD_TYPES as string[]).includes(rawType)
    ? (rawType as PipFieldType)
    : "text";

  if (type === "system") {
    const rawSource = typeof r.systemSource === "string" ? r.systemSource : "";
    if (!SYSTEM_SOURCE_KEYS.has(rawSource)) return null; // unknown source — can't safely lock it
    const baseKey = slugify(typeof r.key === "string" ? r.key : rawSource, `system_${index}`);
    const key = uniqueKey(baseKey, seenKeys);
    return { key, type: "system", systemSource: rawSource as PipSystemFieldSourceKey };
  }

  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (!label) return null;

  const baseKey = slugify(typeof r.key === "string" ? r.key : label, `field_${index}`);
  const key = uniqueKey(baseKey, seenKeys);

  const options =
    type === "select" && Array.isArray(r.options)
      ? r.options.filter((o): o is string => typeof o === "string" && !!o.trim()).map((o) => o.trim())
      : undefined;

  return {
    key,
    label,
    type,
    ...(options && options.length > 0 ? { options } : {}),
    helpText: typeof r.helpText === "string" && r.helpText.trim() ? r.helpText.trim() : null,
    required: r.required === true,
  };
}

function normalizeColumn(raw: unknown, index: number, seenKeys: Set<string>): PipTableColumn | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (!label) return null;

  const baseKey = slugify(typeof r.key === "string" ? r.key : label, `col_${index}`);
  const key = uniqueKey(baseKey, seenKeys);

  let type: PipFieldType | undefined;
  const rawType = typeof r.type === "string" ? (r.type as string) : undefined;
  if (rawType && (VALID_FIELD_TYPES as string[]).includes(rawType) && rawType !== "system") {
    type = rawType as PipFieldType;
  }

  const options =
    Array.isArray(r.options) && type === "select"
      ? r.options.filter((o): o is string => typeof o === "string" && !!o.trim()).map((o) => o.trim())
      : undefined;

  return {
    key,
    label,
    ...(type ? { type } : {}),
    ...(options?.length ? { options } : {}),
  };
}

function normalizeSection(raw: unknown, index: number, seenSectionKeys: Set<string>): PipSection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) return null;

  const baseKey = slugify(typeof r.key === "string" ? r.key : title, `section_${index}`);
  const key = uniqueKey(baseKey, seenSectionKeys);
  const helpText = typeof r.helpText === "string" && r.helpText.trim() ? r.helpText.trim() : null;

  let audience: PipSectionAudience | null = null;
  if (r.audience === "all" || r.audience === "supervisor" || r.audience === "hr") {
    audience = r.audience;
  }

  const isTable =
    r.kind === "table" || (Array.isArray(r.columns) && !Array.isArray(r.fields));

  if (isTable) {
    const seenCols = new Set<string>();
    const columns = (Array.isArray(r.columns) ? r.columns : [])
      .slice(0, MAX_COLUMNS_PER_TABLE)
      .map((c, i) => normalizeColumn(c, i, seenCols))
      .filter((c): c is PipTableColumn => !!c);
    if (columns.length === 0) return null;

    const minRows =
      typeof r.minRows === "number" && r.minRows >= 0 && r.minRows <= 20 ? Math.floor(r.minRows) : 1;

    const resolvedAudience = audience ?? resolvePipSectionAudience({ title, helpText });
    return {
      kind: "table",
      key,
      title,
      helpText,
      audience: resolvedAudience,
      columns,
      minRows,
    };
  }

  const seenFields = new Set<string>();
  const fields = (Array.isArray(r.fields) ? r.fields : [])
    .slice(0, MAX_FIELDS_PER_SECTION)
    .map((f, i) => normalizeField(f, i, seenFields))
    .filter((f): f is PipField => !!f);
  if (fields.length === 0) return null;

  const resolvedAudience = audience ?? resolvePipSectionAudience({ title, helpText });
  return { kind: "fields", key, title, helpText, audience: resolvedAudience, fields };
}

/**
 * Coerces an arbitrary (AI tool-use or hand-authored) JSON payload into a
 * well-formed PipFormSchema, dropping anything malformed rather than
 * throwing — extraction quality varies by source document, so this is
 * deliberately lenient. Returns null only if nothing usable survived.
 */
export function normalizePipFormSchema(raw: unknown): PipFormSchema | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const title =
    typeof r.title === "string" && r.title.trim() ? r.title.trim() : "Performance Improvement Plan";
  const intro = typeof r.intro === "string" && r.intro.trim() ? r.intro.trim() : null;

  const seenSectionKeys = new Set<string>();
  const sections = (Array.isArray(r.sections) ? r.sections : [])
    .slice(0, MAX_SECTIONS)
    .map((s, i) => normalizeSection(s, i, seenSectionKeys))
    .filter((s): s is PipSection => !!s);

  return { title, intro, sections };
}

export function countPipFormFields(schema: PipFormSchema): number {
  return schema.sections.reduce(
    (total, section) =>
      total + (section.kind === "fields" ? section.fields.length : section.columns.length),
    0,
  );
}
