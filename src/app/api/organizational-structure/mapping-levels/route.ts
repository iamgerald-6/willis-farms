import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

/** GET — every level currently in the mapping chain, ordered by position, joined with its list's own label/singular/table_name. */
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
        "id, position, list_type_id, list_type:org_custom_list_types(id, label, singular, table_name)",
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
 * POST — add a list as a new level. If `position` isn't given, it's
 * appended to the end of the chain. If it is given (the mapping set up
 * page computes this from whichever levels the admin picked as "parents"
 * — one past the last of them — or "children" — the first of them, if no
 * parents were picked), every existing level at or after that position is
 * shifted back by one to make room, so the new level is inserted exactly
 * where the admin meant it to go rather than always at the end.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden("System Definitions add access is required.");
    }

    const body = await req.json();
    const listTypeId = body.list_type_id as string | undefined;
    const requestedPosition =
      typeof body.position === "number" && Number.isFinite(body.position) ? body.position : null;
    if (!listTypeId) {
      return NextResponse.json({ error: "list_type_id is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data: existingLevels } = await supabase
      .from("org_mapping_levels")
      .select("id, position")
      .order("position", { ascending: false });

    let position: number;
    if (requestedPosition != null) {
      position = requestedPosition;
      const toShift = (existingLevels ?? []).filter((l) => l.position >= position);
      for (const lvl of toShift) {
        await supabase
          .from("org_mapping_levels")
          .update({ position: lvl.position + 1 })
          .eq("id", lvl.id);
      }
    } else {
      position = ((existingLevels ?? [])[0]?.position ?? 0) + 1;
    }

    const { data, error } = await supabase
      .from("org_mapping_levels")
      .insert([{ list_type_id: listTypeId, position }])
      .select(
        "id, position, list_type_id, list_type:org_custom_list_types(id, label, singular, table_name)",
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
