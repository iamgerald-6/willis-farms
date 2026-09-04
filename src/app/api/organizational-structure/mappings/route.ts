import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import type { OrgMappingGroup, OrgMappingRow } from "@/lib/organizationalStructureMappings";

/**
 * GET — every mapping row in a group's own table (?group_id=...). Labels
 * aren't resolved here — parent_row_id/child_row_id can point at any of
 * the org structure lists depending on the group, so the frontend resolves
 * labels client-side from the parent/child list rows it already has loaded
 * for the dropdowns.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden(
        "System Definitions view access is required to view mappings.",
      );
    }

    const groupId = req.nextUrl.searchParams.get("group_id");
    if (!groupId) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data: group, error: groupError } = await supabase
      .from("org_mapping_groups")
      .select("*")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Unknown mapping group" }, { status: 404 });
    }
    const config = group as OrgMappingGroup;

    const { data, error } = await supabase
      .from(config.table_name)
      .select("id, parent_row_id, child_row_id, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: (data ?? []) as OrgMappingRow[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — add a new mapping row to a group's own table. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden(
        "System Definitions add access is required to add a mapping.",
      );
    }

    const body = await req.json();
    const groupId = (body.group_id as string | undefined)?.trim();
    const parentRowId = (body.parent_row_id as string | undefined)?.trim();
    const childRowId = (body.child_row_id as string | undefined)?.trim();

    if (!groupId || !parentRowId || !childRowId) {
      return NextResponse.json(
        { error: "group_id, parent_row_id and child_row_id are required" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data: group, error: groupError } = await supabase
      .from("org_mapping_groups")
      .select("*")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Unknown mapping group" }, { status: 404 });
    }
    const config = group as OrgMappingGroup;

    const { data, error } = await supabase
      .from(config.table_name)
      .insert([{ parent_row_id: parentRowId, child_row_id: childRowId }])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This mapping already exists." },
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
