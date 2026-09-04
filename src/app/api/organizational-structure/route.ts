import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { ORG_STRUCTURE_LISTS, ORG_STRUCTURE_LIST_KEYS } from "@/lib/organizationalStructure";

/** Hub summary — item count per list, for the Organizational Structure landing page. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden(
        "System Definitions view access is required to view organizational structure.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const counts = await Promise.all(
      ORG_STRUCTURE_LIST_KEYS.map(async (key) => {
        const config = ORG_STRUCTURE_LISTS[key];
        const { count, error } = await supabase
          .from(config.table)
          .select("*", { count: "exact", head: true });
        return {
          key,
          label: config.label,
          count: error ? 0 : (count ?? 0),
        };
      }),
    );

    return NextResponse.json({ data: counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
