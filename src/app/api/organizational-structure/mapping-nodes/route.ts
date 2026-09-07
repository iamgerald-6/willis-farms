import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

/**
 * A mapping "node" as the frontend (mapping-setup page, Create job
 * posting) understands it: one valid item under one specific parent
 * combination. Under the hood this is now backed by two different
 * storage shapes —
 *
 *  - a ROOT level (no parent, e.g. Site) has no real mapping table of its
 *    own (nothing to constrain it against), so its checkbox state still
 *    lives in the old shared org_mapping_nodes table.
 *  - every other level has its own real table (org_map_<its list's table>,
 *    see org-structure-mapping-real-tables.sql), one row per valid item +
 *    its full ancestor chain, with a real FK column per level.
 *
 * This route translates both into the same flat {id, level_id, item_id,
 * parent_node_id} shape so neither frontend page needs to know the
 * difference. `id` is always `${level_id}::${rawId}` — for a root node
 * rawId is the item's own id (root items have no separate row identity to
 * track), for anything else it's the real row id in that level's table.
 */

type LevelRow = {
  id: string;
  parent_level_id: string | null;
  table_name: string | null;
  mapping_columns: string[] | null;
};

type MappingNodeOut = {
  id: string;
  level_id: string;
  item_id: string;
  parent_node_id: string | null;
};

function nodeId(levelId: string, rawId: string): string {
  return `${levelId}::${rawId}`;
}

async function fetchLevels(supabase: SupabaseClient): Promise<LevelRow[]> {
  const { data, error } = await supabase
    .from("org_mapping_levels")
    .select("id, parent_level_id, table_name, mapping_columns");
  if (error) throw new Error(error.message);
  return (data ?? []) as LevelRow[];
}

/** Every level, parents before their children, roots first. */
function topologicalOrder(levels: LevelRow[]): LevelRow[] {
  const children = new Map<string | null, LevelRow[]>();
  for (const lvl of levels) {
    const list = children.get(lvl.parent_level_id) ?? [];
    list.push(lvl);
    children.set(lvl.parent_level_id, list);
  }
  const ordered: LevelRow[] = [];
  const queue = [...(children.get(null) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const child of children.get(current.id) ?? []) queue.push(child);
  }
  return ordered;
}

async function fetchAllNodes(supabase: SupabaseClient): Promise<MappingNodeOut[]> {
  const levels = await fetchLevels(supabase);
  const ordered = topologicalOrder(levels);
  const nodes: MappingNodeOut[] = [];
  // For each level, a lookup from "this row's full ancestor+self column
  // values, in order" (as a JSON-stringified array) to its raw id — used
  // by that level's children to find which of its rows they belong under.
  const rowIndexByLevel = new Map<string, Map<string, string>>();

  for (const level of ordered) {
    if (!level.parent_level_id) {
      const { data, error } = await supabase
        .from("org_mapping_nodes")
        .select("item_id")
        .eq("level_id", level.id);
      if (error) throw new Error(error.message);
      const idx = new Map<string, string>();
      for (const row of data ?? []) {
        const itemId = row.item_id as string;
        nodes.push({ id: nodeId(level.id, itemId), level_id: level.id, item_id: itemId, parent_node_id: null });
        idx.set(JSON.stringify([itemId]), itemId);
      }
      rowIndexByLevel.set(level.id, idx);
      continue;
    }

    if (!level.table_name || !level.mapping_columns || level.mapping_columns.length === 0) {
      rowIndexByLevel.set(level.id, new Map());
      continue; // not built yet — nothing to report
    }

    const columns = level.mapping_columns;
    const ownColumn = columns[columns.length - 1];
    const ancestorColumns = columns.slice(0, -1);

    const { data, error } = await supabase.from(level.table_name).select("*");
    if (error) throw new Error(error.message);

    const idx = new Map<string, string>();
    const parentIdx = rowIndexByLevel.get(level.parent_level_id) ?? new Map<string, string>();

    for (const rowUnknown of data ?? []) {
      const row = rowUnknown as Record<string, string>;
      const itemId = row[ownColumn];
      const ancestorValues = ancestorColumns.map((c) => row[c]);
      const parentMatchKey = JSON.stringify(ancestorValues);
      const parentRawId = parentIdx.get(parentMatchKey);
      const parentNodeId = parentRawId != null ? nodeId(level.parent_level_id, parentRawId) : null;

      nodes.push({
        id: nodeId(level.id, row.id),
        level_id: level.id,
        item_id: itemId,
        parent_node_id: parentNodeId,
      });
      idx.set(JSON.stringify([...ancestorValues, itemId]), row.id);
    }
    rowIndexByLevel.set(level.id, idx);
  }

  return nodes;
}

/** GET — every mapping node across every level, translated into the shared {id, level_id, item_id, parent_node_id} shape. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden("System Definitions view access is required.");
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const data = await fetchAllNodes(supabase);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — mark one item as valid under a specific parent node (or, for a root-level item, under no parent at all). */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden("System Definitions add access is required.");
    }

    const body = await req.json();
    const levelId = body.level_id as string | undefined;
    const itemId = body.item_id as string | undefined;
    const parentNodeId = (body.parent_node_id as string | null | undefined) ?? null;

    if (!levelId || !itemId) {
      return NextResponse.json({ error: "level_id and item_id are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data: level, error: levelError } = await supabase
      .from("org_mapping_levels")
      .select("id, parent_level_id, table_name, mapping_columns")
      .eq("id", levelId)
      .single();
    if (levelError || !level) {
      return NextResponse.json({ error: "That level could not be found." }, { status: 400 });
    }

    // Root level — unchanged behavior, same shared table as before.
    if (!level.parent_level_id) {
      const { error } = await supabase
        .from("org_mapping_nodes")
        .insert([{ level_id: levelId, item_id: itemId, parent_node_id: null }]);
      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "That mapping already exists." }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(
        { data: { id: nodeId(levelId, itemId), level_id: levelId, item_id: itemId, parent_node_id: null } },
        { status: 201 },
      );
    }

    if (!level.table_name || !level.mapping_columns || level.mapping_columns.length === 0) {
      return NextResponse.json({ error: "This level isn't ready yet." }, { status: 400 });
    }
    const columns = level.mapping_columns as string[];
    const ownColumn = columns[columns.length - 1];
    const ancestorColumns = columns.slice(0, -1);

    const insertRow: Record<string, string> = { [ownColumn]: itemId };

    if (ancestorColumns.length > 0) {
      if (!parentNodeId) {
        return NextResponse.json({ error: "A parent selection is required." }, { status: 400 });
      }
      const sep = parentNodeId.indexOf("::");
      const parentRawId = sep === -1 ? parentNodeId : parentNodeId.slice(sep + 2);

      if (ancestorColumns.length === 1) {
        // Immediate parent is root — parentRawId IS the parent's own item id.
        insertRow[ancestorColumns[0]] = parentRawId;
      } else {
        const { data: parentLevel, error: parentLevelError } = await supabase
          .from("org_mapping_levels")
          .select("table_name")
          .eq("id", level.parent_level_id)
          .single();
        if (parentLevelError || !parentLevel?.table_name) {
          return NextResponse.json({ error: "That parent hasn't been mapped yet." }, { status: 400 });
        }
        const { data: parentRow, error: parentRowError } = await supabase
          .from(parentLevel.table_name)
          .select(ancestorColumns.join(","))
          .eq("id", parentRawId)
          .single();
        if (parentRowError || !parentRow) {
          return NextResponse.json({ error: "That parent hasn't been mapped yet." }, { status: 400 });
        }
        for (const col of ancestorColumns) {
          insertRow[col] = (parentRow as unknown as Record<string, string>)[col];
        }
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from(level.table_name)
      .insert([insertRow])
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "That mapping already exists." }, { status: 409 });
      }
      if (insertError.code === "23503") {
        return NextResponse.json({ error: "That parent hasn't been mapped yet." }, { status: 400 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        data: {
          id: nodeId(levelId, inserted.id),
          level_id: levelId,
          item_id: itemId,
          parent_node_id: parentNodeId,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
