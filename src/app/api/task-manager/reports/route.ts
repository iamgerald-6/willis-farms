import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getRequestUser } from "@/lib/taskManagerAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";
import { fetchUserNames } from "@/lib/taskManagerData";
import { getAuthorizedSiteIds } from "@/lib/siteAccess";

// GET /api/task-manager/reports — history of sent monthly reports, shown in
// the "View sent reports" history drawer (same pattern as a task's audit
// log — see AuditLogDrawer.tsx). Now that reports can be scoped to a single
// site (see docs/multi-site/add-site-id-tm-report-schedule.sql), a
// site-scoped caller must only see their own site's past reports — the
// stats_snapshot on a report includes project/owner names and counts from
// whatever site it covered, so an unfiltered list here would leak exactly
// what the schedule/send routes are careful to keep separated.
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user || !isSeniorManagement(user.role)) {
    return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });
  }

  const authorization = getAuthorizedSiteIds(user);

  let query = supabaseAdmin.from("tm_monthly_reports").select("*").order("generated_at", { ascending: false }).limit(12);
  if (authorization.scope !== "ALL_SITES") {
    // A site-scoped caller sees only reports scoped to their own site — not
    // the company-wide report either, since that necessarily includes
    // every other site's data too.
    query = authorization.siteId == null ? query.eq("site_id", -1) : query.eq("site_id", authorization.siteId);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // generated_by is null for anything the cron sent on its own — there's no
  // user to name, so it reads as "Automatic Schedule" rather than blank.
  const userNames = await fetchUserNames((data ?? []).map((r) => r.generated_by).filter(Boolean));
  const reports = (data ?? []).map((r) => ({
    ...r,
    generated_by_name: r.generated_by ? (userNames[r.generated_by] ?? "Unknown") : "Automatic Schedule",
  }));

  return NextResponse.json({ reports });
}
