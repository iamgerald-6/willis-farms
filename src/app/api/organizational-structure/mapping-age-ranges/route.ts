import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import {
  deleteAgeMappingForPath,
  fetchAgeMappingRows,
  upsertAgeMappingRow,
} from "@/lib/organizationalStructure/ageMapping";

/** GET — every Age min/max mapping (one row per org path under Position). */
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

    const data = await fetchAgeMappingRows(supabase);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT — set or replace the Age min/max for one org path (parent_node_id = Position node). */
export async function PUT(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden("System Definitions add access is required.");
    }

    const body = await req.json();
    const levelId = body.level_id as string | undefined;
    const parentNodeId = (body.parent_node_id as string | null | undefined) ?? null;
    const ageMinId = body.age_min_id as string | undefined;
    const ageMaxId = body.age_max_id as string | undefined;

    if (!levelId) {
      return NextResponse.json({ error: "level_id is required." }, { status: 400 });
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    if (!ageMinId || !ageMaxId) {
      await deleteAgeMappingForPath(supabase, levelId, parentNodeId);
      return NextResponse.json({ data: null });
    }

    const data = await upsertAgeMappingRow(supabase, levelId, parentNodeId, ageMinId, ageMaxId);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
