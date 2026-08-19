// app/api/sop/activity/route.ts
//
// Platform-wide SOP activity feed (upload/edit/archive/restore/delete),
// unscoped to any single document — powers the Overview dashboard's Recent
// Activity panel. Distinct from GET /api/sop/[id]/audit, which is one
// document's history; this is every document's, most-recent-first.
//
// Admin/manager/super_admin only — a global "who touched what" feed across
// every SOP is more sensitive than a single document's own history, so this
// gets an explicit role check the per-document route doesn't have.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSeniorManagement } from "@/lib/apiRequestAuth";

export async function GET(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) {
    return NextResponse.json(
      { error: "Forbidden — admin, manager, or super_admin access required." },
      { status: 403 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from("sop_audit_log")
    .select("*")
    .order("performed_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}
