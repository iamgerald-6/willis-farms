// Shared config for the Organizational Structure admin feature — five
// company-wide catalogs (Sites, Business units, Departments / divisions,
// Sections, Grade levels), each its own table. Used by both the API routes
// and the dashboard pages so the list of valid keys/tables lives in one
// place. See docs/organizational-structure/schema.sql for the tables
// themselves.

export type OrgStructureListKey =
  | "sites"
  | "business-units"
  | "departments"
  | "sections"
  | "grade-levels";

export type OrgStructureListConfig = {
  key: OrgStructureListKey;
  table: string;
  label: string;
  /** Singular form, used in "Add ___" buttons and empty states. */
  singular: string;
  /** Only Sites has a region field. */
  hasRegion: boolean;
};

export const ORG_STRUCTURE_LISTS: Record<
  OrgStructureListKey,
  OrgStructureListConfig
> = {
  sites: {
    key: "sites",
    table: "sites",
    label: "Sites",
    singular: "site",
    hasRegion: true,
  },
  "business-units": {
    key: "business-units",
    table: "business_units",
    label: "Business units",
    singular: "business unit",
    hasRegion: false,
  },
  departments: {
    key: "departments",
    table: "departments",
    label: "Departments / divisions",
    singular: "department",
    hasRegion: false,
  },
  sections: {
    key: "sections",
    table: "sections",
    label: "Sections",
    singular: "section",
    hasRegion: false,
  },
  "grade-levels": {
    key: "grade-levels",
    table: "grade_levels",
    label: "Grade levels",
    singular: "grade level",
    hasRegion: false,
  },
};

export const ORG_STRUCTURE_LIST_KEYS = Object.keys(
  ORG_STRUCTURE_LISTS,
) as OrgStructureListKey[];

export function isOrgStructureListKey(
  value: string,
): value is OrgStructureListKey {
  return Object.prototype.hasOwnProperty.call(ORG_STRUCTURE_LISTS, value);
}

export type OrgStructureRow = {
  id: string;
  label: string;
  code: string;
  region: string | null;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** snake_case slug derived from a label, used for the auto-filled `code` column. */
export function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
