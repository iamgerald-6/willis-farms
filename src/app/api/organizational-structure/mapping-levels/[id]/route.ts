import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

/**
 * PATCH — reparent an existing level under a different parent (or make it
 * top-level, with parent_level_id: null). Used when adding a new level that
 * should sit between two existing ones, e.g. inserting "Region" between
 * Site and Business unit reparents Business unit under the new Region.
 *
 * A level's existing mapping nodes were only ever valid under its OLD
 * parent context — once the parent changes, those nodes no longer mean
 * anything (the chain they were built against doesn't exist anymore), so
 * this clears them. That cascades (via org_mapping_nodes' own
 * on-delete-cascade) to every node at every level underneath it too, since
 * those all ultimately chained back through this level's now-deleted nodes.
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

    const { error: clearError } = await supabase
      .from("org_mapping_nodes")
      .delete()
      .eq("level_id", id);
    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("org_mapping_levels")
      .update({ parent_level_id: parentLevelId })
      .eq("id", id)
      .select(
        "id, position, parent_level_id, list_type_id, list_type:org_custom_list_types(id, label, singular, table_name)",
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — remove a level from the mapping chain entirely. Cascades to every mapping node at this level, and (via those nodes' own on-delete-cascade) everything mapped underneath it too, and (via parent_level_id's own on-delete-cascade) every level added underneath it too. */
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

    const { error } = await supabase.from("org_mapping_levels").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
