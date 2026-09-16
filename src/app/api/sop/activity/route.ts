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
import { getAuthorizedSiteIds } from "@/lib/siteAccess";

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

  // Being Senior Management doesn't mean "any site" — same rule as
  // everywhere else. Pull extra rows before the site filter so a Site-
  // scoped caller still gets up to 30 entries that are actually theirs,
  // rather than 30 unfiltered rows immediately cut down to a handful.
  const { data, error } = await supabase
    .from("sop_audit_log")
    .select("*")
    .order("performed_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const authorization = getAuthorizedSiteIds(user);
  let entries = data ?? [];

  if (authorization.scope !== "ALL_SITES") {
    const contentIds = [
      ...new Set(entries.map((e) => e.content_id).filter(Boolean)),
    ];
    const siteIdsByContent: Record<string, number[]> = {};
    if (contentIds.length > 0) {
      const { data: siteTagRows } = await supabase
        .from("content_sites")
        .select("content_id, site_id")
        .in("content_id", contentIds);
      for (const row of siteTagRows ?? []) {
        (siteIdsByContent[row.content_id] ??= []).push(row.site_id);
      }
    }
    entries = entries.filter((e) => {
      const tags = siteIdsByContent[e.content_id] ?? [];
      return (
        tags.length === 0 ||
        (authorization.siteId != null && tags.includes(authorization.siteId))
      );
    });
  }

  return NextResponse.json({ entries: entries.slice(0, 30) });
}
