// Shared types for custom Organizational Structure list types — catalogs an
// admin creates from the Set up page beyond the fixed 5 (Sites, Business
// units, Departments/divisions, Sections, Grade levels). See
// docs/organizational-structure/custom-lists.sql for the tables themselves.

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

export type OrgCustomListType = {
  id: string;
  label: string;
  singular: string;
  code: string;
  has_region: boolean;
  fields: CustomFieldDef[];
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Present on the list returned by GET /custom-list-types — item count for the Set up hub table. */
  item_count?: number;
};

export type OrgCustomListItem = {
  id: string;
  list_type_id: string;
  label: string;
  code: string;
  region: string | null;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  custom_fields: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
};
