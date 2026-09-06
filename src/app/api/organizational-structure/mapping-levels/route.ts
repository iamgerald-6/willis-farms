import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { createLevelTable } from "@/lib/organizationalStructure/mappingTables";

/** GET — every level currently in the mapping tree, joined with its list's own label/singular/table_name. `position` is only a display tie-breaker among siblings — the hierarchy itself lives in parent_level_id. `table_name`/`mapping_columns` describe this level's own real mapping table (see org-structure-mapping-real-tables.sql) — null for a root level, which has none. */
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

    const { data, error } = await supabase
      .from("org_mapping_levels")
      .select(
        "id, position, parent_level_id, table_name, mapping_columns, list_type_id, list_type:org_custom_list_types(id, label, singular, table_name)",
      )
      .order("position", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST — add a list as a new level, with its own single parent level (or
 * null, for a top-level list). Appended to the end for display purposes
 * (`position`) — that has no bearing on the hierarchy.
 *
 * If a parent is given, this also creates the level's own real mapping
 * table (see org-structure-mapping-real-tables.sql) — one real FK column
 * per level in its chain, root down to itself. A root level (no parent)
 * gets no table — nothing to constrain it against.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden("System Definitions add access is required.");
    }

    const body = await req.json();
    const listTypeId = body.list_type_id as string | undefined;
    const parentLevelId = (body.parent_level_id as string | null | undefined) ?? null;
    if (!listTypeId) {
      return NextResponse.json({ error: "list_type_id is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data: listType, error: listTypeError } = await supabase
      .from("org_custom_list_types")
      .select("id, table_name")
      .eq("id", listTypeId)
      .single();
    if (listTypeError || !listType) {
      return NextResponse.json({ error: "That list could not be found." }, { status: 400 });
    }

    const { data: last } = await supabase
      .from("org_mapping_levels")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (last?.position ?? 0) + 1;

    const { data: inserted, error: insertError } = await supabase
      .from("org_mapping_levels")
      .insert([{ list_type_id: listTypeId, parent_level_id: parentLevelId, position }])
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "That list is already part of the mapping chain." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (parentLevelId) {
      try {
        await createLevelTable(supabase, inserted.id, listType.table_name as string);
      } catch (tableErr) {
        // Roll back the level row rather than leave a level with no table.
        await supabase.from("org_mapping_levels").delete().eq("id", inserted.id);
        const message = tableErr instanceof Error ? tableErr.message : "Could not create mapping table.";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    const { data, error } = await supabase
      .from("org_mapping_levels")
      .select(
        "id, position, parent_level_id, table_name, mapping_columns, list_type_id, list_type:org_custom_list_types(id, label, singular, table_name)",
      )
      .eq("id", inserted.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
