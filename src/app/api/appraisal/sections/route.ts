import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAuth } from "@/lib/apiRequestAuth";

/**
 * Lightweight lookup of the org-structure "Sections" list (id/label), used
 * to auto-populate Section Authorisations Held on the appraisal form from
 * the employee's stored users.section_id (see resolveEmployeeOrgPlacement.ts).
 * Any authenticated user can hit this — appraisal filling isn't gated on
 * User Management or System Definitions access, so this can't reuse those
 * routes' permission checks.
 */
export async function GET(req: NextRequest) {
  const caller = await requireAuth(req);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("sections")
    .select("id, label")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
