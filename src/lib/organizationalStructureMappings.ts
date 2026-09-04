// Shared config for the Organizational Structure "Mapping set up" feature —
// junction tables that link one org structure list to the next in the
// hierarchy (Site -> Business unit -> Department/division -> Section).
// Mirrors the pattern in organizationalStructure.ts: one small config object
// per pair, used by both the generic mapping API route and the accordion UI
// so the list of valid pairs lives in one place.

import { ORG_STRUCTURE_LISTS, type OrgStructureListKey } from "@/lib/organizationalStructure";

export type OrgMappingPairKey =
  | "site-business-units"
  | "business-unit-departments"
  | "department-sections";

export type OrgMappingPairConfig = {
  key: OrgMappingPairKey;
  /** Junction table name in Postgres. */
  table: string;
  /** Foreign key column on the junction table pointing at the parent row. */
  parentColumn: string;
  /** Foreign key column on the junction table pointing at the child row. */
  childColumn: string;
  parentListKey: OrgStructureListKey;
  childListKey: OrgStructureListKey;
  title: string;
};

export const ORG_MAPPING_PAIRS: Record<OrgMappingPairKey, OrgMappingPairConfig> = {
  "site-business-units": {
    key: "site-business-units",
    table: "site_business_units",
    parentColumn: "site_id",
    childColumn: "business_unit_id",
    parentListKey: "sites",
    childListKey: "business-units",
    title: "Sites & business units",
  },
  "business-unit-departments": {
    key: "business-unit-departments",
    table: "business_unit_departments",
    parentColumn: "business_unit_id",
    childColumn: "department_id",
    parentListKey: "business-units",
    childListKey: "departments",
    title: "Business units & departments",
  },
  "department-sections": {
    key: "department-sections",
    table: "department_sections",
    parentColumn: "department_id",
    childColumn: "section_id",
    parentListKey: "departments",
    childListKey: "sections",
    title: "Departments & sections",
  },
};

export const ORG_MAPPING_PAIR_KEYS = Object.keys(
  ORG_MAPPING_PAIRS,
) as OrgMappingPairKey[];

export function isOrgMappingPairKey(value: string): value is OrgMappingPairKey {
  return Object.prototype.hasOwnProperty.call(ORG_MAPPING_PAIRS, value);
}

/** Postgres table name for a list key, e.g. "business-units" -> "business_units". */
export function orgStructureTableFor(listKey: OrgStructureListKey): string {
  return ORG_STRUCTURE_LISTS[listKey].table;
}

export type OrgMappingRow = {
  id: string;
  parent_id: string;
  parent_label: string;
  child_id: string;
  child_label: string;
  created_at: string;
};
