/**
 * Cascading org-tree helpers for Appraisal / Skill log template scope.
 *
 * Child dropdowns are filtered from the real mapping tables:
 *   org_map_business_units
 *   org_map_departments
 *   org_map_sections
 *   org_map_custom_position
 *   org_map_grade_levels
 *
 * Site is the root catalog (`sites`). Labels still come from the catalog
 * tables; these map rows only decide which IDs are valid under the current pick.
 */

export const ORG_SCOPE_CHAIN = [
  "sites",
  "business_units",
  "departments",
  "sections",
  "custom_position",
  "grade_levels",
] as const;

export type OrgScopeTable = (typeof ORG_SCOPE_CHAIN)[number];

export const ORG_MAP_TABLES = {
  business_units: "org_map_business_units",
  departments: "org_map_departments",
  sections: "org_map_sections",
  custom_position: "org_map_custom_position",
  grade_levels: "org_map_grade_levels",
} as const;

export type OrgMapKey = keyof typeof ORG_MAP_TABLES;

export type OrgMapRow = Record<string, string | null>;

export type OrgMapRows = Record<OrgMapKey, OrgMapRow[]>;

export const EMPTY_ORG_MAP_ROWS: OrgMapRows = {
  business_units: [],
  departments: [],
  sections: [],
  custom_position: [],
  grade_levels: [],
};

const ITEM_COLUMN: Record<OrgMapKey, string> = {
  business_units: "business_unit_id",
  departments: "department_id",
  sections: "section_id",
  custom_position: "position_id",
  grade_levels: "grade_level_id",
};

const FILTER_COLUMNS: Record<OrgMapKey, string[]> = {
  business_units: ["site_id"],
  departments: ["site_id", "business_unit_id"],
  sections: ["site_id", "business_unit_id", "department_id"],
  custom_position: ["site_id", "business_unit_id", "department_id", "section_id"],
  grade_levels: [
    "site_id",
    "business_unit_id",
    "department_id",
    "section_id",
    "position_id",
  ],
};

const COLUMN_TO_SELECTION: Record<string, OrgScopeTable> = {
  site_id: "sites",
  business_unit_id: "business_units",
  department_id: "departments",
  section_id: "sections",
  position_id: "custom_position",
  grade_level_id: "grade_levels",
};

export function parentOrgTable(tableName: string): OrgScopeTable | undefined {
  const idx = ORG_SCOPE_CHAIN.indexOf(tableName as OrgScopeTable);
  return idx > 0 ? ORG_SCOPE_CHAIN[idx - 1] : undefined;
}

export function itemsForOrgMapField<T extends { id: string }>(
  tableName: string,
  catalog: T[],
  selections: Record<string, string | undefined>,
  maps: OrgMapRows,
): T[] {
  if (tableName === "sites") return catalog;

  const key = tableName as OrgMapKey;
  if (!(key in ITEM_COLUMN)) return [];

  const filters = FILTER_COLUMNS[key];
  const filterValues: Record<string, string> = {};
  for (const col of filters) {
    const selectionKey = COLUMN_TO_SELECTION[col];
    const value = selectionKey ? selections[selectionKey] : undefined;
    if (!value) return [];
    filterValues[col] = value;
  }

  const itemCol = ITEM_COLUMN[key];
  const ids = new Set(
    (maps[key] ?? [])
      .filter((row) => filters.every((col) => row[col] === filterValues[col]))
      .map((row) => row[itemCol])
      .filter((id): id is string => !!id),
  );
  return catalog.filter((item) => ids.has(item.id));
}
