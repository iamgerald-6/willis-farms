import type { SupabaseClient } from "@supabase/supabase-js";

export const AGE_MAPPING_TABLE = "org_map_custom_age";
export const AGE_LIST_TABLE = "custom_age";

export type AgeMappingRowOut = {
  id: string;
  level_id: string;
  parent_node_id: string | null;
  age_min_id: string;
  age_max_id: string;
};

type LevelRow = {
  id: string;
  parent_level_id: string | null;
  table_name: string | null;
  mapping_columns: string[] | null;
};

function nodeId(levelId: string, rawId: string): string {
  return `${levelId}::${rawId}`;
}

/** Numeric sort for Age catalog rows (labels are whole years). */
export function sortAgeCatalogItems<T extends { label: string; sort_order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const an = parseInt(a.label, 10);
    const bn = parseInt(b.label, 10);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

export function parseAgeCatalogYear(label: string): number | null {
  const n = parseInt(label.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export function filterAgeCatalogByRange<T extends { id: string; label: string }>(
  items: T[],
  minId: string | null | undefined,
  maxId: string | null | undefined,
): T[] {
  if (!minId || !maxId) return items;
  const minItem = items.find((i) => i.id === minId);
  const maxItem = items.find((i) => i.id === maxId);
  const lo = minItem ? parseAgeCatalogYear(minItem.label) : null;
  const hi = maxItem ? parseAgeCatalogYear(maxItem.label) : null;
  if (lo == null || hi == null) return items;
  const minYear = Math.min(lo, hi);
  const maxYear = Math.max(lo, hi);
  return items.filter((item) => {
    const year = parseAgeCatalogYear(item.label);
    return year != null && year >= minYear && year <= maxYear;
  });
}

/** Build ancestor FK values for an org_map_custom_age row from a parent mapping node id. */
export async function ancestorValuesForParentNode(
  supabase: SupabaseClient,
  level: LevelRow,
  parentNodeId: string | null,
): Promise<Record<string, string> | null> {
  if (!level.parent_level_id || !level.mapping_columns) return null;

  const ancestorColumns = level.mapping_columns.filter(
    (c) => c !== "age_min_id" && c !== "age_max_id",
  );
  if (ancestorColumns.length === 0) return {};

  if (!parentNodeId) {
    return null;
  }

  const sep = parentNodeId.indexOf("::");
  const parentLevelId = sep === -1 ? null : parentNodeId.slice(0, sep);
  const parentRawId = sep === -1 ? parentNodeId : parentNodeId.slice(sep + 2);

  if (ancestorColumns.length === 1) {
    const { data: parentLevel } = await supabase
      .from("org_mapping_levels")
      .select("list_type:org_custom_list_types(job_posting_column)")
      .eq("id", level.parent_level_id)
      .single();
    const col = (parentLevel as { list_type?: { job_posting_column?: string } } | null)?.list_type
      ?.job_posting_column;
    if (!col) return null;
    return { [ancestorColumns[0]]: parentRawId };
  }

  const { data: parentLevel } = await supabase
    .from("org_mapping_levels")
    .select("table_name")
    .eq("id", parentLevelId ?? level.parent_level_id)
    .single();
  if (!parentLevel?.table_name) return null;

  const { data: parentRow } = await supabase
    .from(parentLevel.table_name)
    .select(ancestorColumns.join(","))
    .eq("id", parentRawId)
    .maybeSingle();
  if (!parentRow) return null;

  const values: Record<string, string> = {};
  for (const col of ancestorColumns) {
    const v = (parentRow as Record<string, string>)[col];
    if (!v) return null;
    values[col] = v;
  }
  return values;
}

export async function fetchAgeMappingRows(supabase: SupabaseClient): Promise<AgeMappingRowOut[]> {
  // Look up by physical mapping table — not list_type.table_name. A join filter
  // on list_type can match multiple org_mapping_levels rows (orphaned levels,
  // duplicate chains) and maybeSingle() then returns nothing even when rows exist
  // in org_map_custom_age.
  const { data: level } = await supabase
    .from("org_mapping_levels")
    .select("id, parent_level_id, table_name, mapping_columns")
    .eq("table_name", AGE_MAPPING_TABLE)
    .maybeSingle();

  const levelRow = level as LevelRow | null;
  if (!levelRow?.table_name || !levelRow.mapping_columns?.includes("age_min_id")) {
    return [];
  }

  const { data: rows, error } = await supabase.from(levelRow.table_name).select("*");
  if (error) throw new Error(error.message);

  const ancestorColumns = levelRow.mapping_columns.filter(
    (c) => c !== "age_min_id" && c !== "age_max_id",
  );
  const parentLevelId = levelRow.parent_level_id;
  const out: AgeMappingRowOut[] = [];

  for (const rowUnknown of rows ?? []) {
    const row = rowUnknown as Record<string, string>;
    const ageMinId = row.age_min_id;
    const ageMaxId = row.age_max_id;
    if (!ageMinId || !ageMaxId) continue;

    let parentNodeId: string | null = null;
    if (parentLevelId && ancestorColumns.length > 0) {
      if (ancestorColumns.length === 1) {
        parentNodeId = nodeId(parentLevelId, row[ancestorColumns[0]]);
      } else {
        const { data: parentLevel } = await supabase
          .from("org_mapping_levels")
          .select("table_name, mapping_columns")
          .eq("id", parentLevelId)
          .single();
        if (parentLevel?.table_name && parentLevel.mapping_columns) {
          const parentOwnCol = (parentLevel.mapping_columns as string[]).slice(-1)[0];
          const parentAncestorCols = (parentLevel.mapping_columns as string[]).slice(0, -1);
          let query = supabase.from(parentLevel.table_name).select("id");
          for (const col of parentAncestorCols) {
            query = query.eq(col, row[col]);
          }
          query = query.eq(parentOwnCol, row[parentOwnCol]);
          const { data: parentMatch } = await query.maybeSingle();
          if (parentMatch?.id) {
            parentNodeId = nodeId(parentLevelId, parentMatch.id as string);
          }
        }
      }
    }

    out.push({
      id: nodeId(levelRow.id, row.id),
      level_id: levelRow.id,
      parent_node_id: parentNodeId,
      age_min_id: ageMinId,
      age_max_id: ageMaxId,
    });
  }

  return out;
}

export async function upsertAgeMappingRow(
  supabase: SupabaseClient,
  levelId: string,
  parentNodeId: string | null,
  ageMinId: string,
  ageMaxId: string,
): Promise<AgeMappingRowOut> {
  const { data: level, error: levelError } = await supabase
    .from("org_mapping_levels")
    .select("id, parent_level_id, table_name, mapping_columns")
    .eq("id", levelId)
    .single();
  if (levelError || !level) {
    throw new Error("That level could not be found.");
  }
  const levelRow = level as LevelRow;
  if (levelRow.table_name !== AGE_MAPPING_TABLE) {
    throw new Error("This endpoint is only for the Age mapping level.");
  }
  if (!levelRow.mapping_columns?.includes("age_min_id")) {
    throw new Error("Age mapping table is not set up yet — reconnect Age under Position.");
  }

  const ancestorValues = await ancestorValuesForParentNode(supabase, levelRow, parentNodeId);
  if (ancestorValues === null) {
    throw new Error("A parent selection is required.");
  }

  const insertRow: Record<string, string> = {
    ...ancestorValues,
    age_min_id: ageMinId,
    age_max_id: ageMaxId,
  };

  let deleteQuery = supabase.from(levelRow.table_name).delete();
  for (const [col, val] of Object.entries(ancestorValues)) {
    deleteQuery = deleteQuery.eq(col, val);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw new Error(deleteError.message);

  const { data: inserted, error: insertError } = await supabase
    .from(levelRow.table_name)
    .insert([insertRow])
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  return {
    id: nodeId(levelId, inserted.id as string),
    level_id: levelId,
    parent_node_id: parentNodeId,
    age_min_id: ageMinId,
    age_max_id: ageMaxId,
  };
}

/** Age eligibility for a posting — read from org_map_custom_age for its org path. */
export async function resolveAgeRangeFromMapping(
  supabase: SupabaseClient,
  placement: {
    site_id?: string | null;
    business_unit_id?: string | null;
    department_id?: string | null;
    section_id?: string | null;
    position_id?: string | null;
  },
): Promise<{ ageMin: number; ageMax: number } | null> {
  if (!placement.position_id) return null;

  const { data: level } = await supabase
    .from("org_mapping_levels")
    .select("table_name, mapping_columns")
    .eq("table_name", AGE_MAPPING_TABLE)
    .maybeSingle();

  const mappingColumns = (level as { mapping_columns?: string[] } | null)?.mapping_columns;
  if (!mappingColumns?.includes("age_min_id")) return null;

  const ancestorColumns = mappingColumns.filter(
    (c) => c !== "age_min_id" && c !== "age_max_id",
  );

  let query = supabase.from(AGE_MAPPING_TABLE).select("age_min_id, age_max_id");
  for (const col of ancestorColumns) {
    const value = (placement as Record<string, string | null | undefined>)[col];
    if (!value) return null;
    query = query.eq(col, value);
  }

  const { data: mapRow } = await query.maybeSingle();
  if (!mapRow?.age_min_id || !mapRow?.age_max_id) return null;

  const { data: ageItems } = await supabase
    .from(AGE_LIST_TABLE)
    .select("id, label")
    .in("id", [mapRow.age_min_id as string, mapRow.age_max_id as string]);

  const labelById = new Map((ageItems ?? []).map((item) => [item.id as string, item.label as string]));
  const minYear = parseAgeCatalogYear(labelById.get(mapRow.age_min_id as string) ?? "");
  const maxYear = parseAgeCatalogYear(labelById.get(mapRow.age_max_id as string) ?? "");
  if (minYear == null || maxYear == null) return null;

  return { ageMin: Math.min(minYear, maxYear), ageMax: Math.max(minYear, maxYear) };
}

export async function deleteAgeMappingForPath(
  supabase: SupabaseClient,
  levelId: string,
  parentNodeId: string | null,
): Promise<void> {
  const { data: level } = await supabase
    .from("org_mapping_levels")
    .select("id, parent_level_id, table_name, mapping_columns")
    .eq("id", levelId)
    .single();
  if (!level?.table_name) return;

  const levelRow = level as LevelRow;
  const ancestorValues = await ancestorValuesForParentNode(supabase, levelRow, parentNodeId);
  if (!ancestorValues) return;

  let deleteQuery = supabase.from(levelRow.table_name).delete();
  for (const [col, val] of Object.entries(ancestorValues)) {
    deleteQuery = deleteQuery.eq(col, val);
  }
  const { error } = await deleteQuery;
  if (error) throw new Error(error.message);
}
