import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getRequestUser, requireSeniorManagement } from "@/lib/taskManagerAuth";
import { computeDisplayStatus } from "@/lib/taskAccessControl";

// GET /api/task-manager/projects
// Anyone with the tm_can_view_all_tasks grant (or who's super_admin) sees
// every active project — see canViewAllTasks() in taskAccessControl.ts.
// This is a separate permission from Senior Management (role-based write
// access); by default only super_admin has it until granted to specific
// users via the Users page. Everyone else only sees a project if they own
// at least one non-deleted task inside it — per Sheila's instruction that
// employees shouldn't see a tab they have no tasks under, not just a
// grayed-out one — or if they created the project themselves (so a brand
// new, still-empty project isn't invisible to the person who just made it).
export async function GET(req: NextRequest) {
  try {
    // Archived projects are only ever shown in the "Manage Projects" modal
    // (see ManageProjectsModal.tsx) — everywhere else (the project pills,
    // the report/calendar pickers) only wants active ones, and that default
    // keeps the existing broader read access unchanged for every caller
    // that doesn't ask for archived projects.
    const includeArchived = req.nextUrl.searchParams.get("include") === "all";
    const user = includeArchived ? await requireSeniorManagement(req) : await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: includeArchived ? "Forbidden — Senior Management only" : "Unauthorized" }, { status: includeArchived ? 403 : 401 });
    }

    let projectsQuery = supabaseAdmin.from("tm_projects").select("*").order("created_at", { ascending: true });
    if (!includeArchived) projectsQuery = projectsQuery.eq("status", "active");
    const { data: projects, error } = await projectsQuery;
    if (error) throw error;

    // Read scope, not write permission — see canViewAllTasks() in
    // taskAccessControl.ts, already resolved onto user.canViewAllTasks by
    // getRequestUser. Project/task creation, editing, etc. still go through
    // requireSeniorManagement (role-based) unchanged.
    const canSeeAll = user.canViewAllTasks;

    const { data: taskCounts, error: countsError } = await supabaseAdmin
      .from("tm_tasks")
      .select("project_id, owner_id, lifecycle_status, due_date, is_recurring, progress_percent")
      .neq("lifecycle_status", "deleted");
    if (countsError) throw countsError;

    const visibleProjectIds = new Set<string>();
    const statsByProject: Record<string, { total: number; open: number; overdue: number }> = {};

    for (const t of taskCounts ?? []) {
      if (!canSeeAll && t.owner_id !== user.id) continue;
      visibleProjectIds.add(t.project_id);

      const stats = statsByProject[t.project_id] ?? { total: 0, open: 0, overdue: 0 };
      stats.total += 1;
      if (t.lifecycle_status === "active") {
        stats.open += 1;
        // Use the same computeDisplayStatus every task badge uses — a raw
        // `new Date(due_date) < new Date()` double-counted tasks due
        // "today" as overdue because it compared a UTC midnight timestamp
        // against the current wall-clock time instead of normalizing both
        // to the same day boundary.
        const status = computeDisplayStatus(t.due_date, t.lifecycle_status, t.is_recurring, t.progress_percent);
        if (status === "Overdue") stats.overdue += 1;
      }
      statsByProject[t.project_id] = stats;
    }

    // Manage Projects is an administrative surface (Senior Management
    // only, enforced above) — it needs to list every project regardless of
    // task ownership, not just the ones the caller happens to own tasks in.
    //
    // A project the caller just created has no tasks in it yet, so it can
    // never appear in visibleProjectIds (that set is built from task
    // ownership) — without created_by here, creating a project made it
    // invisible to its own creator until they added a task or were granted
    // tm_can_view_all_tasks. The creator should always see their own
    // project.
    const result = (projects ?? [])
      .filter((p) => includeArchived || canSeeAll || p.created_by === user.id || visibleProjectIds.has(p.id))
      .map((p) => ({
        ...p,
        task_count: statsByProject[p.id]?.total ?? 0,
        open_task_count: statsByProject[p.id]?.open ?? 0,
        overdue_task_count: statsByProject[p.id]?.overdue ?? 0,
      }));

    return NextResponse.json({ projects: result });
  } catch (err: any) {
    console.error("[GET /api/task-manager/projects]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

// POST /api/task-manager/projects — Senior Management only
export async function POST(req: NextRequest) {
  try {
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    const { name, description } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Project name is required" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("tm_projects")
      .insert([{ name: name.trim(), description: description ?? null, created_by: user.id }])
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ project: data });
  } catch (err: any) {
    console.error("[POST /api/task-manager/projects]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
