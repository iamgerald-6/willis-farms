import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getRequestUser } from "@/lib/taskManagerAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";
import { updateTaskProgress } from "@/lib/taskManagerData";

// PATCH /api/task-manager/tasks/[id]/progress
// Narrower than the full edit route: the task's own owner can update just
// this field, without needing Senior Management / edit-mode access. Senior
// Management can also use it on any task. Hitting 100 auto-completes the
// task the same way clicking Complete does, and is logged the same way.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: task, error: fetchError } = await supabaseAdmin.from("tm_tasks").select("owner_id").eq("id", id).single();
    if (fetchError || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const isOwner = task.owner_id && task.owner_id === user.id;
    if (!isOwner && !isSeniorManagement(user.role)) {
      return NextResponse.json({ error: "Only the task's owner or Senior Management can update progress" }, { status: 403 });
    }

    const { progress_percent } = await req.json();
    if (typeof progress_percent !== "number" || Number.isNaN(progress_percent)) {
      return NextResponse.json({ error: "progress_percent must be a number" }, { status: 400 });
    }

    const result = await updateTaskProgress(id, progress_percent, user);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ task: result.task });
  } catch (err: any) {
    console.error("[PATCH /api/task-manager/tasks/[id]/progress]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
