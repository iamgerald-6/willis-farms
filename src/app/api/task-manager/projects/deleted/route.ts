import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireSeniorManagement } from "@/lib/taskManagerAuth";
import { assertSiteAccess, getAuthorizedSiteIds } from "@/lib/siteAccess";

// GET /api/task-manager/projects/deleted — Senior Management only.
// Lists the tombstone log of permanently-deleted projects (see
// tm_project_deletions in schema.sql) — read-only, no restore. Capped to the
// most recent 20; this is a quick "who deleted what" reference, not a full
// archive browser.
export async function GET(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  // Being Senior Management doesn't mean any site — same rule as
  // everywhere else. Widen the raw query before the site filter so a
  // site-scoped caller still gets up to 20 of their own entries, same
  // pattern used for sop/activity.
  const { data, error } = await supabaseAdmin
    .from("tm_project_deletions")
    .select("*")
    .order("deleted_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let deletions = data ?? [];
  if (getAuthorizedSiteIds(user).scope !== "ALL_SITES") {
    deletions = deletions.filter(
      (d) => d.site_id == null || assertSiteAccess(user, d.site_id),
    );
  }

  return NextResponse.json({ deletions: deletions.slice(0, 20) });
}
