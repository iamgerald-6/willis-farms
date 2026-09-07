import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import {
  collectSubtreeIds,
  createLevelTable,
  dropLevelTable,
  type MappingLevelRow,
} from "@/lib/organizationalStructure/mappingTables";
import type { SupabaseClient } from "@supabase/supabase-js";

type LevelWithListType = MappingLevelRow & {
  list_type_id: string;
  list_type: { table_name: string } | null;
};

async function fetchAllLevels(supabase: SupabaseClient): Promise<LevelWithListType[]> {
  const { data, error } = await supabase
    .from("org_mapping_levels")
    .select("id, parent_level_id, table_name, list_type_id, list_type:org_custom_list_types(table_name)");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LevelWithListType[];
}

function listTypeTableName(row: LevelWithListType): string | null {
  return row.list_type?.table_name ?? null;
}

/**
 * PATCH — reparent an existing level under a different parent (or make it
 * top-level, with parent_level_id: null).
 *
 * Reparenting changes what a level's own real mapping table's columns need
 * to be (it needs an FK for every ancestor, and that ancestor chain just
 * changed) — same for every level underneath it, since their chains all
 * pass through this one. So this drops and rebuilds the physical table for
 * this level and its whole subtree, which clears their existing mappings
 * (the same trade-off reparenting already had under the old model).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden("System Definitions edit access is required.");
    }

    const body = await req.json();
    const parentLevelId = (body.parent_level_id as string | null | undefined) ?? null;

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const allLevels = await fetchAllLevels(supabase);
    const subtreeIds = collectSubtreeIds(allLevels, id);
    const subtree = allLevels.filter((l) => subtreeIds.includes(l.id));

    // Drop every affected physical table first (this level and everything
    // under it) before changing the parent link, so nothing is left
    // pointing at a stale ancestor chain in between.
    for (const lvl of subtree) {
      await dropLevelTable(supabase, lvl.id, lvl.table_name);
    }

    const { error: reparentError } = await supabase
      .from("org_mapping_levels")
      .update({ parent_level_id: parentLevelId })
      .eq("id", id);
    if (reparentError) {
      return NextResponse.json({ error: reparentError.message }, { status: 500 });
    }

    // A root level's leftover checkbox mappings (org_mapping_nodes) only
    // make sense under its old parent context (or lack thereof) — clear
    // them too, the same way the physical tables were just cleared.
    await supabase.from("org_mapping_nodes").delete().in("level_id", subtreeIds);

    // Rebuild tables top-down: the level itself first (using its new
    // parent), then each descendant using its own (unchanged) parent link
    // — descendant tables still need rebuilding even though their direct
    // parent didn't move, since their full root-to-self chain runs through
    // this level and just changed further up.
    const target = allLevels.find((l) => l.id === id);
    const targetTable = target ? listTypeTableName(target) : null;
    if (parentLevelId && targetTable) {
      await createLevelTable(supabase, id, targetTable);
    }

    for (const lvl of subtree) {
      if (lvl.id === id) continue;
      if (!lvl.parent_level_id) continue; // shouldn't happen inside a subtree, but guard anyway
      const tableName = listTypeTableName(lvl);
      if (tableName) await createLevelTable(supabase, lvl.id, tableName);
    }

    const { data, error } = await supabase
      .from("org_mapping_levels")
      .select(
        "id, position, parent_level_id, table_name, mapping_columns, list_type_id, list_type:org_custom_list_types(id, label, singular, table_name)",
      )
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE — remove a level from the mapping chain entirely, along with its
 * own real mapping table and every level (and table) underneath it.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden("System Definitions edit access is required.");
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const allLevels = await fetchAllLevels(supabase);
    const subtreeIds = collectSubtreeIds(allLevels, id);
    const subtree = allLevels.filter((l) => subtreeIds.includes(l.id));

    for (const lvl of subtree) {
      await dropLevelTable(supabase, lvl.id, lvl.table_name);
    }
    await supabase.from("org_mapping_nodes").delete().in("level_id", subtreeIds);

    // Deleting the level row cascades (parent_level_id is on delete
    // cascade) to remove every descendant level's own row too.
    const { error } = await supabase.from("org_mapping_levels").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
