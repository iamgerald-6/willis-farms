import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

/** GET — every level currently in the mapping tree, joined with its list's own label/singular/table_name. `position` is only a display tie-breaker among siblings now — the hierarchy itself lives in parent_level_id. */
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
        "id, position, parent_level_id, list_type_id, list_type:org_custom_list_types(id, label, singular, table_name)",
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
 * (`position`) — that has no bearing on the hierarchy, so nothing needs
 * shifting the way it used to.
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

    const { data: last } = await supabase
      .from("org_mapping_levels")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (last?.position ?? 0) + 1;

    const { data, error } = await supabase
      .from("org_mapping_levels")
      .insert([{ list_type_id: listTypeId, parent_level_id: parentLevelId, position }])
      .select(
        "id, position, parent_level_id, list_type_id, list_type:org_custom_list_types(id, label, singular, table_name)",
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "That list is already part of the mapping chain." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
