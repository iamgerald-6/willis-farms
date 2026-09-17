import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getRequestUser, requireSeniorManagement } from "@/lib/taskManagerAuth";
import { enrichTasks, fetchUserNames, fetchProjectNames, fetchSubtaskTreesByTaskId, writeAuditLog } from "@/lib/taskManagerData";
import {
  applyTaskListVisibilityFilter,
  assertOwnerSiteAssignable,
  isProjectSiteVisible,
  isTaskSiteVisible,
  resolveTaskViewScope,
} from "@/lib/taskManagerScope";
import { siteIdFromJoin } from "@/lib/siteAccess";

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
      .select("*, tm_projects(site_id)")
      .in("lifecycle_status", include)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (projectId) query = query.eq("project_id", projectId);

    const scope = resolveTaskViewScope(user.role, user.tm_can_view_all_tasks);
    query = await applyTaskListVisibilityFilter(
      query,
      supabaseAdmin,
      user.id,
      scope,
    );

    const { data: rawTasks, error } = await query;
    if (error) throw error;

    // Being able to see a task by ownership/reports scope doesn't mean any
    // site — same rule as everywhere else. Applied on top of the existing
    // scope filter above, not instead of it.
    const tasks = (rawTasks ?? [])
      .filter((t) => isTaskSiteVisible(user, t, siteIdFromJoin(t.tm_projects)))
      .map(({ tm_projects, ...rest }) => rest);

    const userNames = await fetchUserNames(tasks.map((t) => t.owner_id));

    // Only look up project names when spanning multiple projects — a
    // single-project request already knows which project it's looking at.
    const projectNames = projectId ? undefined : await fetchProjectNames(tasks.map((t) => t.project_id));
    const subtaskTrees = await fetchSubtaskTreesByTaskId(tasks.map((t) => t.id));

    return NextResponse.json({ tasks: enrichTasks(tasks, userNames, projectNames, subtaskTrees) });
  } catch (err: any) {
    console.error("[GET /api/task-manager/tasks]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

// POST /api/task-manager/tasks — Senior Management (anyone), or anyone
// recorded as the assignee's actual supervisor_id (self or one of their
// direct reports) — see canCreate below. Not gated on the caller's own role
// label: a supervisor can hold Supervisory Role, Executive Role, Human
// Resource, or Super Admin (see canBeAssignedAsSupervisorByRoleLabel), so
// what matters is the supervisor_id relationship itself, not the label.
export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { project_id, title, owner_id, start_date, due_date, is_recurring, task_type, frequency, indicator, method_provider, description } = body;

    if (!project_id || !title?.trim()) {
      return NextResponse.json({ error: "project_id and title are required" }, { status: 400 });
    }

    // Being able to create a task doesn't mean any site — same rule as
    // everywhere else. A caller not at headquarters can only add tasks to a
    // project that's untagged, their own, or at their own site.
    const { data: targetProject } = await supabaseAdmin
      .from("tm_projects")
      .select("site_id, created_by")
      .eq("id", project_id)
      .maybeSingle();
    if (targetProject && !isProjectSiteVisible(user, targetProject)) {
      return NextResponse.json(
        { error: "Forbidden — this project isn't at a site you have access to." },
        { status: 403 },
      );
    }

    // Only headquarters callers may assign a task across sites — everyone
    // else is locked to assigning tasks to people at their own site.
    if (!(await assertOwnerSiteAssignable(supabaseAdmin, user, owner_id))) {
      return NextResponse.json(
        { error: "Forbidden — you can only assign tasks to people at your own site." },
        { status: 403 },
      );
    }

    let canCreate = (await requireSeniorManagement(req)) !== null;
    if (!canCreate && owner_id === user.id) {
      canCreate = true;
    }
    if (!canCreate && owner_id) {
      const { data: owner } = await supabaseAdmin
        .from("users")
        .select("supervisor_id")
        .eq("user_id", owner_id)
        .maybeSingle();
      canCreate = owner?.supervisor_id === user.id;
    }
    if (!canCreate) {
      return NextResponse.json(
        { error: "Forbidden — Senior Management access, or being the assignee's supervisor, is required." },
        { status: 403 },
      );
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
