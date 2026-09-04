import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import {
  isOrgMappingPairKey,
  ORG_MAPPING_PAIRS,
} from "@/lib/organizationalStructureMappings";

/** DELETE — remove a mapping row for this pair. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pair: string; id: string }> },
) {
  try {
    const { pair, id } = await params;
    if (!isOrgMappingPairKey(pair)) {
      return NextResponse.json({ error: "Unknown mapping pair" }, { status: 404 });
    }

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to remove a mapping.",
      );
    }

    const config = ORG_MAPPING_PAIRS[pair];

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { error } = await supabase.from(config.table).delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
