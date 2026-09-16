import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getRequestUser } from "@/lib/taskManagerAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";
import { assertTaskSiteAccess } from "@/lib/taskManagerScope";

// GET /api/task-manager/tasks/[id]/audit — who changed what, and when.
// Senior Management only (an employee doesn't need to see who edited a
// task, only that it changed — which shows up as the task itself updating).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getRequestUser(req);
  if (!user || !isSeniorManagement(user.role)) {
    return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });
  }

  // Being Senior Management doesn't mean any site — same rule as
  // everywhere else.
  const { data: task } = await supabaseAdmin
    .from("tm_tasks")
    .select("project_id, owner_id, created_by")
    .eq("id", id)
    .maybeSingle();
  if (task && !(await assertTaskSiteAccess(supabaseAdmin, user, task))) {
    return NextResponse.json(
      { error: "Forbidden — this task isn't at a site you have access to." },
      { status: 403 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("tm_task_audit_log")
    .select("*")
    .eq("task_id", id)
    .order("performed_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [] });
}
