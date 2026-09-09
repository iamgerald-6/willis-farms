import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Org structure mapping set up — real per-level tables.
 *
 * Every level with a parent gets its own physical Postgres table, named
 * after its own list (e.g. mapping Business unit under Site creates
 * org_map_business_units), with one real FK column per level in its chain
 * — root down to itself (e.g. org_map_departments has site_id,
 * business_unit_id, department_id). A root level (no parent, e.g. Site)
 * never gets one of these — nothing to constrain it against; its own
 * checkbox mappings (rare) keep using org_mapping_nodes instead.
 *
 * See docs/organizational-structure/org-structure-mapping-real-tables.sql
 * for the table/RPC definitions this calls into.
 */

export type LevelChainRow = {
  seq: number;
  level_id: string;
  column_name: string;
  ref_table: string;
};

/** A level's full ancestor chain, root first, ending with itself. */
export async function fetchLevelChain(
  supabase: SupabaseClient,
  levelId: string,
): Promise<LevelChainRow[]> {
  const { data, error } = await supabase.rpc("org_mapping_level_chain", {
    p_level_id: levelId,
  });
  if (error) throw new Error(error.message);
  return (data as LevelChainRow[]) ?? [];
}

export function mappingTableNameFor(listTypeTableName: string): string {
  return `org_map_${listTypeTableName}`;
}

/** Creates the physical table for a level (must already exist as a row, with its parent_level_id set) and records its table_name/mapping_columns. Only ever called for a non-root level. */
export async function createLevelTable(
  supabase: SupabaseClient,
  levelId: string,
  listTypeTableName: string,
): Promise<{ tableName: string; columns: string[] }> {
  const chain = await fetchLevelChain(supabase, levelId);
  if (chain.length === 0) {
    throw new Error("Could not resolve this level's ancestor chain.");
  }
  const tableName = mappingTableNameFor(listTypeTableName);

  // Age maps a min/max pair from the Age catalog per org path — not checkbox rows.
  const rpcColumns =
    listTypeTableName === "custom_age"
      ? [
          ...chain.slice(0, -1).map((c) => ({ column_name: c.column_name, ref_table: c.ref_table })),
          { column_name: "age_min_id", ref_table: "custom_age" },
          { column_name: "age_max_id", ref_table: "custom_age" },
        ]
      : chain.map((c) => ({ column_name: c.column_name, ref_table: c.ref_table }));
  const columns = rpcColumns.map((c) => c.column_name);

  const { error: createError } = await supabase.rpc("create_org_mapping_table", {
    p_table_name: tableName,
    p_columns: rpcColumns,
  });
  if (createError) throw new Error(createError.message);

  const { error: updateError } = await supabase
    .from("org_mapping_levels")
    .update({ table_name: tableName, mapping_columns: columns })
    .eq("id", levelId);
  if (updateError) throw new Error(updateError.message);

  return { tableName, columns };
}

/** Drops a level's physical table (if it has one) and clears the metadata columns recording it. Safe to call on a level that never had one. */
export async function dropLevelTable(
  supabase: SupabaseClient,
  levelId: string,
  tableName: string | null,
): Promise<void> {
  if (tableName) {
    const { error } = await supabase.rpc("drop_org_mapping_table", {
      p_table_name: tableName,
    });
    if (error) throw new Error(error.message);
  }
  await supabase
    .from("org_mapping_levels")
    .update({ table_name: null, mapping_columns: null })
    .eq("id", levelId);
}

export type MappingLevelRow = {
  id: string;
  parent_level_id: string | null;
  table_name: string | null;
};

/** Every level at or below `levelId` in the tree (levelId itself first), given the full current set of levels. Used before a delete/reparent, so every affected physical table can be dropped. */
export function collectSubtreeIds(levels: MappingLevelRow[], levelId: string): string[] {
  const byParent = new Map<string | null, MappingLevelRow[]>();
  for (const lvl of levels) {
    const list = byParent.get(lvl.parent_level_id) ?? [];
    list.push(lvl);
    byParent.set(lvl.parent_level_id, list);
  }
  const ids: string[] = [levelId];
  const queue = [levelId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of byParent.get(current) ?? []) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}
