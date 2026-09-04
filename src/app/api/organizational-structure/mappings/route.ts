import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import type { OrgMappingGroup, OrgMappingRow } from "@/lib/organizationalStructureMappings";

/**
 * GET — every mapping row in a group's own table (?group_id=...). The
 * table's real columns are named after its two lists (e.g. section_id,
 * position_id) — this always returns them as parent_row_id/child_row_id so
 * the frontend doesn't need to know those names. Labels aren't resolved
 * here either; the frontend resolves them client-side from the parent/
 * child list rows it already has loaded for the dropdowns.
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

    // Built dynamically per group, so Supabase's literal-string select
    // parser can't type it — cast to `string` to opt out of that check.
    const selectClause =
      `id, ${config.parent_column}, ${config.child_column}, created_at` as string;

    const { data, error } = await supabase
      .from(config.table_name)
      .select(selectClause)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows: OrgMappingRow[] = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      parent_row_id: row[config.parent_column] as string,
      child_row_id: row[config.child_column] as string,
      created_at: row.created_at as string,
    }));

    return NextResponse.json({ data: rows });
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
      .insert([{ [config.parent_column]: parentRowId, [config.child_column]: childRowId }])
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

    const row: OrgMappingRow = {
      id: data.id,
      parent_row_id: data[config.parent_column],
      child_row_id: data[config.child_column],
      created_at: data.created_at,
    };

    return NextResponse.json({ data: row }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
