import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

type LevelRow = {
  id: string;
  parent_level_id: string | null;
  table_name: string | null;
  mapping_columns: string[] | null;
  list_type: { job_posting_column: string } | null;
};

/**
 * Removes every row, at every level underneath `level`, that was only
 * valid because of the row about to be deleted. Under the old shared
 * org_mapping_nodes table this fell out of parent_node_id's own
 * on-delete-cascade; each level's real table now only has FK columns
 * pointing at the actual list tables (sites, business_units, ...), not at
 * each other, so nothing cascades on its own — this walks the tree by
 * hand instead, matching each descendant's ancestor columns against the
 * row being removed.
 */
async function cascadeDeleteDescendants(
  supabase: SupabaseClient,
  levels: LevelRow[],
  level: LevelRow,
  deletedRowValues: Record<string, string>,
): Promise<void> {
  const children = levels.filter((l) => l.parent_level_id === level.id);
  for (const child of children) {
    if (!child.table_name || !child.mapping_columns || child.mapping_columns.length === 0) continue;
    const ancestorCols = child.mapping_columns.slice(0, -1);

    let query = supabase.from(child.table_name).select("*");
    for (const col of ancestorCols) {
      query = query.eq(col, deletedRowValues[col]);
    }
    const { data: matches, error } = await query;
    if (error) throw new Error(error.message);

    for (const rowUnknown of matches ?? []) {
      const row = rowUnknown as Record<string, string>;
      await cascadeDeleteDescendants(supabase, levels, child, row);
      const { error: delError } = await supabase.from(child.table_name).delete().eq("id", row.id);
      if (delError) throw new Error(delError.message);
    }
  }
}

/** DELETE — remove one mapping. `id` is `${level_id}::${rawId}` (see mapping-nodes/route.ts for what rawId means for a root vs. non-root level). Also removes anything mapped underneath it, by hand — see cascadeDeleteDescendants above. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sep = id.indexOf("::");
    if (sep === -1) {
      return NextResponse.json({ error: "Invalid mapping id." }, { status: 400 });
    }
    const levelId = id.slice(0, sep);
    const rawId = id.slice(sep + 2);

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden("System Definitions edit access is required.");
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data: levels, error: levelsError } = await supabase
      .from("org_mapping_levels")
      .select(
        "id, parent_level_id, table_name, mapping_columns, list_type:org_custom_list_types(job_posting_column)",
      );
    if (levelsError) {
      return NextResponse.json({ error: levelsError.message }, { status: 500 });
    }
    const allLevels = (levels ?? []) as unknown as LevelRow[];
    const level = allLevels.find((l) => l.id === levelId);
    if (!level) {
      return NextResponse.json({ error: "That level could not be found." }, { status: 404 });
    }

    if (!level.parent_level_id) {
      // Root — rawId is the item's own id. Its "descendants" for cascade
      // purposes are direct-child levels' rows whose one ancestor column
      // (that root list's own job_posting_column) equals this item id.
      if (level.list_type?.job_posting_column) {
        await cascadeDeleteDescendants(supabase, allLevels, level, {
          [level.list_type.job_posting_column]: rawId,
        });
      }
      const { error: delError } = await supabase
        .from("org_mapping_nodes")
        .delete()
        .eq("level_id", levelId)
        .eq("item_id", rawId);
      if (delError) {
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (!level.table_name) {
      return NextResponse.json({ ok: true }); // nothing to delete — table doesn't exist
    }

    const { data: row, error: rowError } = await supabase
      .from(level.table_name)
      .select("*")
      .eq("id", rawId)
      .maybeSingle();
    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 });
    }
    if (row) {
      await cascadeDeleteDescendants(supabase, allLevels, level, row as Record<string, string>);
    }

    const { error: delError } = await supabase.from(level.table_name).delete().eq("id", rawId);
    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
