import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getRequestUser, requireSeniorManagement } from "@/lib/taskManagerAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";

// GET /api/task-manager/projects
// Senior Management sees every active project. Everyone else only sees a
// project if they own at least one non-deleted task inside it — per
// Sheila's instruction that employees shouldn't see a tab they have no
// tasks under, not just a grayed-out one.
export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: projects, error } = await supabaseAdmin
      .from("tm_projects")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const senior = isSeniorManagement(user.role);

    const { data: taskCounts, error: countsError } = await supabaseAdmin
      .from("tm_tasks")
      .select("project_id, owner_id, lifecycle_status, due_date, is_recurring")
      .neq("lifecycle_status", "deleted");
    if (countsError) throw countsError;

    const visibleProjectIds = new Set<string>();
    const statsByProject: Record<string, { total: number; open: number; overdue: number }> = {};

    for (const t of taskCounts ?? []) {
      if (!senior && t.owner_id !== user.id) continue;
      visibleProjectIds.add(t.project_id);

      const stats = statsByProject[t.project_id] ?? { total: 0, open: 0, overdue: 0 };
      stats.total += 1;
      if (t.lifecycle_status === "active") {
        stats.open += 1;
        if (t.due_date && new Date(t.due_date) < new Date()) stats.overdue += 1;
      }
      statsByProject[t.project_id] = stats;
    }

    const result = (projects ?? [])
      .filter((p) => senior || visibleProjectIds.has(p.id))
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
