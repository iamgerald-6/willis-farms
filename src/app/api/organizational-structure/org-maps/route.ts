import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireOrganizationalStructureReadAccess,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import {
  EMPTY_ORG_MAP_ROWS,
  ORG_MAP_TABLES,
  type OrgMapKey,
  type OrgMapRows,
} from "@/lib/organizationalStructureMapping";

/**
 * Raw rows from the real per-level mapping tables. Used by Appraisal /
 * Skill log scope dropdowns so they filter by mapped parent IDs, not the
 * global catalogs or the old org_mapping_nodes graph.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireOrganizationalStructureReadAccess(req);
    if (!caller) {
      return jsonForbidden(
        "You do not have permission to view organizational structure mapping.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const data: OrgMapRows = { ...EMPTY_ORG_MAP_ROWS };
    for (const key of Object.keys(ORG_MAP_TABLES) as OrgMapKey[]) {
      const { data: rows, error } = await supabase.from(ORG_MAP_TABLES[key]).select("*");
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      data[key] = (rows ?? []) as OrgMapRows[OrgMapKey];
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
