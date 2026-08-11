import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getRequestUser } from "@/lib/taskManagerAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";
import { updateTaskProgress, fetchUserNames, collectSubtaskOwnerIds, attachSubtaskOwnerNames } from "@/lib/taskManagerData";
import { buildSubtaskTree, computeTaskRollup, attachSubtaskStatuses } from "@/lib/subtaskProgress";

// PATCH /api/task-manager/tasks/[id]/subtasks/[subtaskId] — ticks/unticks a
// single LEAF subtask. Same permission as the plain progress slider it
// replaces: the task's own owner, or Senior Management. A subtask with its
// own children can't be ticked directly — its completion is always derived
// from its children instead (see computeNodeCompletion).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; subtaskId: string }> }) {
  try {
    const { id, subtaskId } = await params;
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: task, error: taskError } = await supabaseAdmin.from("tm_tasks").select("owner_id").eq("id", id).single();
    if (taskError || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const isOwner = task.owner_id && task.owner_id === user.id;
    if (!isOwner && !isSeniorManagement(user.role)) {
      return NextResponse.json({ error: "Only the task's owner or Senior Management can update subtasks" }, { status: 403 });
    }

    const { is_done } = await req.json();
    if (typeof is_done !== "boolean") return NextResponse.json({ error: "is_done must be true or false" }, { status: 400 });

    const { data: subtask, error: subtaskError } = await supabaseAdmin
      .from("tm_subtasks")
      .select("*")
      .eq("id", subtaskId)
      .eq("task_id", id)
      .single();
    if (subtaskError || !subtask) return NextResponse.json({ error: "Subtask not found" }, { status: 404 });

    const { count: childCount, error: childError } = await supabaseAdmin
      .from("tm_subtasks")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", subtaskId);
    if (childError) throw childError;
    if ((childCount ?? 0) > 0) {
      return NextResponse.json({ error: "This subtask has its own subtasks — it completes automatically as they're ticked" }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("tm_subtasks")
      .update({ is_done, updated_at: new Date().toISOString() })
      .eq("id", subtaskId);
    if (updateError) throw updateError;

    const { data: allRows, error: refetchError } = await supabaseAdmin
      .from("tm_subtasks")
      .select("*")
      .eq("task_id", id)
      .order("position", { ascending: true });
    if (refetchError) throw refetchError;

    const tree = buildSubtaskTree(allRows ?? []);
    const rollup = computeTaskRollup(tree);

    let recurred = false;
    let nextDueDate: string | null = null;
    let finalTree = tree;
    // The main task's own progress_percent/display_status, straight from
    // updateTaskProgress's own enrichTasks call — sent back to the client so
    // it can patch its cached task-list query directly instead of relying
    // solely on a background refetch (triggered by invalidateQueries) to
    // land before the reviewer looks at the screen. Ticking one of several
    // nested sub-subtasks only moves the rollup a few points (e.g. 30% ->
    // 38%), which is easy to miss if the list refetch is even briefly
    // delayed — this makes the update land in the same round trip as the
    // tick itself.
    let updatedTask: unknown = null;
    if (rollup !== null) {
      const result = await updateTaskProgress(id, rollup, user, { allowReopen: true });
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      recurred = !!result.recurred;
      nextDueDate = result.next_due_date ?? null;
      updatedTask = result.task ?? null;

      if (recurred) {
        // The task cycled forward to its next occurrence instead of
        // closing — progress_percent resets to 0 (see
        // performTaskCompletion), and the subtask checkboxes need to reset
        // the same way. Without this, the new cycle would open with every
        // box still ticked from the cycle that just finished, and the
        // rollup would immediately read 100% again without anyone
        // touching anything.
        const { data: resetRows, error: resetError } = await supabaseAdmin
          .from("tm_subtasks")
          .update({ is_done: false, updated_at: new Date().toISOString() })
          .eq("task_id", id)
          .select();
        if (resetError) throw resetError;
        finalTree = buildSubtaskTree(resetRows ?? []);
      }
    }

    const statusedTree = attachSubtaskStatuses(finalTree);
    const userNames = await fetchUserNames(collectSubtaskOwnerIds(statusedTree));
    return NextResponse.json({
      subtasks: attachSubtaskOwnerNames(statusedTree, userNames),
      recurred,
      next_due_date: nextDueDate,
      task: updatedTask,
    });
  } catch (err: any) {
    console.error("[PATCH /api/task-manager/tasks/[id]/subtasks/[subtaskId]]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
