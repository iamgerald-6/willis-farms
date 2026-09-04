import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import type { OrgCustomListType } from "@/lib/organizationalStructureCustomLists";
import type { OrgMappingGroup } from "@/lib/organizationalStructureMappings";

/**
 * DELETE — remove a custom list type: drops any mapping groups that link
 * to it (their own tables too, same as deleting a mapping group directly),
 * then drops the list's own physical table, then its registry row.
 * Irreversible, same as deleting any of the fixed org structure lists'
 * underlying table would be.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to remove a list.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data: listType, error: listTypeError } = await supabase
      .from("org_custom_list_types")
      .select("*")
      .eq("id", id)
      .single();

    if (listTypeError || !listType) {
      return NextResponse.json({ error: "Unknown list" }, { status: 404 });
    }
    const config = listType as OrgCustomListType;
    const ref = `custom:${id}`;

    const { data: dependentGroups, error: dependentGroupsError } = await supabase
      .from("org_mapping_groups")
      .select("*")
      .or(`parent_list_key.eq.${ref},child_list_key.eq.${ref}`);

    if (dependentGroupsError) {
      return NextResponse.json({ error: dependentGroupsError.message }, { status: 500 });
    }

    for (const group of (dependentGroups ?? []) as OrgMappingGroup[]) {
      const { error: dropMappingTableError } = await supabase.rpc(
        "drop_org_dynamic_mapping_table",
        { p_table_name: group.table_name },
      );
      if (dropMappingTableError) {
        return NextResponse.json({ error: dropMappingTableError.message }, { status: 500 });
      }
      const { error: deleteGroupError } = await supabase
        .from("org_mapping_groups")
        .delete()
        .eq("id", group.id);
      if (deleteGroupError) {
        return NextResponse.json({ error: deleteGroupError.message }, { status: 500 });
      }
    }

    const { error: dropError } = await supabase.rpc("drop_org_dynamic_list_table", {
      p_table_name: config.table_name,
    });
    if (dropError) {
      return NextResponse.json({ error: dropError.message }, { status: 500 });
    }

    const { error } = await supabase.from("org_custom_list_types").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
