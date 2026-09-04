// Small shared helpers for the Organizational Structure admin feature.
//
// Every list — Sites, Business units, Departments / divisions, Sections,
// Grade levels, and any custom list created from Set up — is a row in
// org_custom_list_types, each with its own physical table. There's no
// separate "fixed list" system anymore; see
// docs/organizational-structure/merge-fixed-lists.sql for how the original
// 5 lists were folded into that registry, and
// src/lib/organizationalStructureCustomLists.ts for the shared types.

/** Ghana's 16 administrative regions — used as the Region dropdown options on any list with has_region: true (e.g. Sites). */
export const GHANA_REGIONS = [
  "Ahafo",
  "Ashanti",
  "Bono",
  "Bono East",
  "Central",
  "Eastern",
  "Greater Accra",
  "North East",
  "Northern",
  "Oti",
  "Savannah",
  "Upper East",
  "Upper West",
  "Volta",
  "Western",
  "Western North",
] as const;

/** snake_case slug derived from a label, used for the auto-filled `code` column. */
export function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
