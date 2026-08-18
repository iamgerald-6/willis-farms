import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireSeniorManagement } from "@/lib/taskManagerAuth";

// GET /api/task-manager/projects/deleted — Senior Management only.
// Lists the tombstone log of permanently-deleted projects (see
// tm_project_deletions in schema.sql) — read-only, no restore. Capped to the
// most recent 20; this is a quick "who deleted what" reference, not a full
// archive browser.
export async function GET(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("tm_project_deletions")
    .select("*")
    .order("deleted_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deletions: data ?? [] });
}
