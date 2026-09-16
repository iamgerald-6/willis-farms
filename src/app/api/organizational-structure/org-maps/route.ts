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
 * Every column on these real per-level mapping tables is either a real
 * uuid FK (business_unit_id, department_id, ...) or — for site_id
 * specifically — a real integer FK to `sites(id)`, the one table in the
 * whole org-structure system with a non-uuid primary key (see
 * docs/current_database_schema.sql). PostgREST serializes that column as a
 * JSON number, while the frontend's filter/comparison logic
 * (itemsForOrgMapField in src/lib/organizationalStructureMapping.ts) reads
 * every selection value as a string (HTML <select> values are always
 * strings) — an unnormalized number there silently breaks every dropdown
 * chained under Site. Stringifying every value here, generically rather
 * than special-casing "site_id" by name, means this stays correct even if
 * another non-uuid list ever joins the mapping chain later.
 */
function normalizeMapRow(row: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value == null ? null : String(value);
  }
  return out;
}

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
      data[key] = ((rows ?? []) as Record<string, unknown>[]).map(normalizeMapRow) as OrgMapRows[OrgMapKey];
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
