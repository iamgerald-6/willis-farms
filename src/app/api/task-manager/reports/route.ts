import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getRequestUser } from "@/lib/taskManagerAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";
import { fetchUserNames } from "@/lib/taskManagerData";

// GET /api/task-manager/reports — history of sent monthly reports, shown in
// the "View sent reports" history drawer (same pattern as a task's audit
// log — see AuditLogDrawer.tsx).
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user || !isSeniorManagement(user.role)) {
    return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("tm_monthly_reports")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(12);
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
