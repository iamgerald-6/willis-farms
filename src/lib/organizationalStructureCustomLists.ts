// Shared types for custom Organizational Structure list types — catalogs an
// admin creates from the Set up page beyond the fixed 5 (Sites, Business
// units, Departments/divisions, Sections, Grade levels). Each one gets its
// own real Postgres table (named table_name below) — same pattern as sites,
// business_units, etc. — rather than sharing one generic table. See
// docs/organizational-structure/custom-lists.sql and
// docs/organizational-structure/dynamic-list-tables.sql for the tables and
// the functions that create/drop them.

export type CustomFieldType = "text" | "number" | "boolean" | "date" | "select";

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / No" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
];

export type CustomFieldDef = {
  key: string;
  label: string;
  type: CustomFieldType;
  /** Only present when type === "select". */
  options?: string[];
};

/**
 * How a numeric-range list's generator behaves: "digits" fills one row per
 * whole number (e.g. Age: 15, 16, 17…); "bands" fills salary-style ranges
 * from min, max, and range length (e.g. 1000-2000, 2000-3000…).
 */
export type NumericRangeMode = "digits" | "bands";

/** Age list — digits-mode catalog (15, 16, 17…). Eligibility min/max is on org mapping. */
export function isAgeCatalogListType(
  listType: Pick<OrgCustomListType, "table_name" | "label">,
): boolean {
  return listType.table_name === "custom_age" || /^ages?$/i.test(listType.label.trim());
}

/** Normalize Age list metadata for API/UI (digits fill on Manage, no job posting columns). */
export function normalizeAgeCatalogListType<T extends OrgCustomListType>(listType: T): T {
  if (!isAgeCatalogListType(listType)) return listType;
  return {
    ...listType,
    is_numeric_range: true,
    numeric_range_mode: "digits",
    job_posting_column: null,
    job_posting_min_column: null,
    job_posting_max_column: null,
  };
}

/** Whether Manage shows the bulk min/max generator (Age digits, Salary bands, etc.). */
export function listUsesNumericRangeGenerator(
  listType: Pick<
    OrgCustomListType,
    "table_name" | "label" | "is_numeric_range" | "numeric_range_mode"
  >,
): boolean {
  if (isAgeCatalogListType(listType)) return true;
  return listType.is_numeric_range;
}

export type OrgCustomListType = {
  id: string;
  label: string;
  singular: string;
  code: string;
  /** Name of this list's own physical table, e.g. "custom_cost_centres". */
  table_name: string;
  has_region: boolean;
  /** When true, Manage shows a range generator — Age (digits) or Salary (bands). */
  is_numeric_range: boolean;
  /** Only meaningful when is_numeric_range is true. */
  numeric_range_mode: NumericRangeMode;
  fields: CustomFieldDef[];
  sort_order: number;
  /** Disabled lists are hidden from anywhere they'd be picked for new use (e.g. Create job posting's org-structure fields) — the table, its data, and existing references are untouched. */
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Present on the list returned by GET /custom-list-types — item count for the Set up hub table. */
  item_count?: number;
  /**
   * Name of the real foreign key column on job_postings that points at
   * this list's table (e.g. "site_id"), set up by
   * docs/organizational-structure/job-postings-org-fields.sql. Null only
   * transiently, if the column failed to create.
   */
  job_posting_column: string | null;
  /**
   * Only set for digits-mode numeric-range lists (not Age) — two more real
   * foreign key columns on job_postings (e.g. "age_min_id"/"age_max_id"),
   * letting a posting specify a range instead of one value. See
   * docs/organizational-structure/job-postings-range-fields.sql. Null for
   * every non-numeric-range list — the single/range choice doesn't apply.
   */
  job_posting_min_column: string | null;
  job_posting_max_column: string | null;
};

/**
 * A row in a custom list's own table. Extra fields the admin defined are
 * real columns on that table (keyed by each field's `key`), not a nested
 * JSON blob — hence the index signature.
 */
export type OrgCustomListItem = {
  id: string;
  label: string;
  code: string;
  region: string | null;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
} & Record<string, unknown>;
