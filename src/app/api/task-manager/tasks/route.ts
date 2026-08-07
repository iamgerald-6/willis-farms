import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getRequestUser, requireSeniorManagement } from "@/lib/taskManagerAuth";
import { enrichTasks, fetchUserNames, fetchProjectNames, fetchTaskIdsWithSubtasks, writeAuditLog } from "@/lib/taskManagerData";

// GET /api/task-manager/tasks?project_id=xxx&include=active,completed,archived,deleted
// project_id is optional — omit it to get tasks across every active project
// (used by the Compliance Calendar, which spans all projects, not just one).
// Defaults to "active" only. Pass include=active,completed,archived,deleted
// to see lifecycle history (used by the archive/lifecycle views).
export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");
    const include = (searchParams.get("include") ?? "active").split(",").map((s) => s.trim());

    let query = supabaseAdmin
      .from("tm_tasks")
      .select("*")
      .in("lifecycle_status", include)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (projectId) query = query.eq("project_id", projectId);

    // Read scope: distinct from write permission (isSeniorManagement, used
    // below for POST) — see canViewAllTasks() in taskAccessControl.ts.
    if (!user.canViewAllTasks) query = query.eq("owner_id", user.id);

    const { data: tasks, error } = await query;
    if (error) throw error;

    const userNames = await fetchUserNames((tasks ?? []).map((t) => t.owner_id));

    // Only look up project names when spanning multiple projects — a
    // single-project request already knows which project it's looking at.
    const projectNames = projectId ? undefined : await fetchProjectNames((tasks ?? []).map((t) => t.project_id));
    const subtaskTaskIds = await fetchTaskIdsWithSubtasks((tasks ?? []).map((t) => t.id));

    return NextResponse.json({ tasks: enrichTasks(tasks ?? [], userNames, projectNames, subtaskTaskIds) });
  } catch (err: any) {
    console.error("[GET /api/task-manager/tasks]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

// POST /api/task-manager/tasks — Senior Management only
export async function POST(req: NextRequest) {
  try {
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    const body = await req.json();
    const { project_id, title, owner_id, start_date, due_date, is_recurring, task_type, frequency, indicator, method_provider, description } = body;

    if (!project_id || !title?.trim()) {
      return NextResponse.json({ error: "project_id and title are required" }, { status: 400 });
    }

    const { data: task, error } = await supabaseAdmin
      .from("tm_tasks")
      .insert([
        {
          project_id,
          title: title.trim(),
          description: description ?? null,
          owner_id: owner_id ?? null,
          start_date: start_date ?? null,
          due_date: due_date ?? null,
          is_recurring: !!is_recurring,
          task_type: task_type ?? "general",
          frequency: frequency ?? null,
          indicator: indicator ?? null,
          method_provider: method_provider ?? null,
          source: "manual",
          created_by: user.id,
        },
      ])
      .select()
      .single();
    if (error) throw error;

    await writeAuditLog({
      task_id: task.id,
      project_id: task.project_id,
      action: "created",
      new_values: { title: task.title, owner_id: task.owner_id, due_date: task.due_date },
      performedBy: user,
    });

    const userNames = await fetchUserNames([task.owner_id]);
    return NextResponse.json({ task: enrichTasks([task], userNames)[0] });
  } catch (err: any) {
    console.error("[POST /api/task-manager/tasks]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
