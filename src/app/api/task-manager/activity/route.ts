// app/api/task-manager/activity/route.ts
//
// Platform-wide Task Manager activity feed for the Overview dashboard's
// Recent Activity panel — merges task edits, project edits, and permanently
// deleted projects (tombstoned separately in tm_project_deletions since
// their own audit trail cascade-deletes with them). Senior Management only,
// same gate as GET /api/task-manager/projects?include=all, since this
// crosses every project regardless of the caller's own task ownership.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireSeniorManagement } from "@/lib/taskManagerAuth";

export async function GET(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) {
    return NextResponse.json(
      { error: "Forbidden — Senior Management only" },
      { status: 403 },
    );
  }

  const [taskLog, projectLog, deletions] = await Promise.all([
    supabaseAdmin
      .from("tm_task_audit_log")
      .select("*")
      .order("performed_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("tm_project_audit_log")
      .select("*")
      .order("performed_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("tm_project_deletions")
      .select("*")
      .order("deleted_at", { ascending: false })
      .limit(10),
  ]);

  if (taskLog.error) {
    return NextResponse.json({ error: taskLog.error.message }, { status: 500 });
  }
  if (projectLog.error) {
    return NextResponse.json({ error: projectLog.error.message }, { status: 500 });
  }
  if (deletions.error) {
    return NextResponse.json({ error: deletions.error.message }, { status: 500 });
  }

  return NextResponse.json({
    tasks: taskLog.data ?? [],
    projects: projectLog.data ?? [],
    deletions: deletions.data ?? [],
  });
}
