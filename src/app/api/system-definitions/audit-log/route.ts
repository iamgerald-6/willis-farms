import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

const PAGE_SIZE = 50;

// GET /api/system-definitions/audit-log — who changed what, and when, across
// every System Definitions module (leave policy, appraisal weights, grade
// levels, dropdown options, etc). Same audience as the settings themselves:
// anyone with System Definitions view access.
export async function GET(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden(
        "System Definitions view access is required to see the audit log.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(req.url);
    const moduleId = searchParams.get("module_id");
    const before = searchParams.get("before");

    let query = supabase
      .from("system_config_audit_log")
      .select("*")
      .order("performed_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (moduleId) query = query.eq("module_id", moduleId);
    if (before) query = query.lt("performed_at", before);

    const { data, error } = await query;

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json(
          {
            entries: [],
            error:
              "The system_config_audit_log table is not set up yet. Run docs/system-definitions/audit-log.sql in Supabase first.",
          },
          { status: 200 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      entries: data ?? [],
      hasMore: (data ?? []).length === PAGE_SIZE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
