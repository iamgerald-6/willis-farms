import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import type { OrgMappingGroup } from "@/lib/organizationalStructureMappings";

/** DELETE — remove a mapping group: drops its physical table, then its registry row. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to remove a mapping group.",
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
      .eq("id", id)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Unknown mapping group" }, { status: 404 });
    }
    const config = group as OrgMappingGroup;

    const { error: dropError } = await supabase.rpc("drop_org_dynamic_mapping_table", {
      p_table_name: config.table_name,
    });
    if (dropError) {
      return NextResponse.json({ error: dropError.message }, { status: 500 });
    }

    const { error } = await supabase.from("org_mapping_groups").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
