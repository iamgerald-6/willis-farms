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
 * whole number (e.g. Age: 15, 16, 17...); "bands" fills bucketed ranges of
 * a given length (e.g. Salary: 1000-2000, 2000-3000...).
 */
export type NumericRangeMode = "digits" | "bands";

export type OrgCustomListType = {
  id: string;
  label: string;
  singular: string;
  code: string;
  /** Name of this list's own physical table, e.g. "custom_cost_centres". */
  table_name: string;
  has_region: boolean;
  /** When true, Manage shows a range generator instead of a label field — e.g. Age, Salary. */
  is_numeric_range: boolean;
  /** Only meaningful when is_numeric_range is true. */
  numeric_range_mode: NumericRangeMode;
  fields: CustomFieldDef[];
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Present on the list returned by GET /custom-list-types — item count for the Set up hub table. */
  item_count?: number;
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
