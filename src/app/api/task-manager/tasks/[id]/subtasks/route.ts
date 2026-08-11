import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireSeniorManagement } from "@/lib/taskManagerAuth";
import { updateTaskProgress, fetchUserNames, collectSubtaskOwnerIds, attachSubtaskOwnerNames } from "@/lib/taskManagerData";
import { buildSubtaskTree, computeTaskRollup, attachSubtaskStatuses, isDateWithin, MAX_SUBTASK_DEPTH, sumWeights } from "@/lib/subtaskProgress";

// GET /api/task-manager/tasks/[id]/subtasks — the full nested tree for a task,
// with owner_name and the computed status (see attachSubtaskStatuses) stamped
// onto every node.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data: rows, error } = await supabaseAdmin
      .from("tm_subtasks")
      .select("*")
      .eq("task_id", id)
      .order("position", { ascending: true });
    if (error) throw error;

    const tree = attachSubtaskStatuses(buildSubtaskTree(rows ?? []));
    const userNames = await fetchUserNames(collectSubtaskOwnerIds(tree));
    return NextResponse.json({ subtasks: attachSubtaskOwnerNames(tree, userNames) });
  } catch (err: any) {
    console.error("[GET /api/task-manager/tasks/[id]/subtasks]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

// PUT /api/task-manager/tasks/[id]/subtasks — Senior Management only.
// Replaces one whole sibling group at once: { parent_id, items: [{ id?, title,
// weight_percent, owner_id?, start_date?, due_date? }] }. parent_id: null for
// the task's top-level subtasks, or an existing subtask's id to replace ITS
// children (one level deeper). items with an `id` are updated in place (their
// own children, if any, are left untouched); items without one are created;
// any existing sibling not present in `items` is deleted (cascading to its
// own children — removing a subtask removes whatever was nested under it
// too). An empty items array deletes the whole group, which is how a task
// drops subtasks entirely and falls back to the manual progress slider.
//
// Hard-blocks the save unless the incoming weights sum to exactly the target
// (per Sheila's explicit choice) — the only exception is submitting an empty
// group, which has nothing to sum. The target is 100 for a top-level group
// (the task's own "weight"), or the parent subtask's own weight_percent for
// a nested group — weight_percent is absolute at every depth (each item's
// own share of the WHOLE task), so a 30%-weight subtask's children sum to
// 30, not 100 (see computeNodeCompletion in subtaskProgress.ts). Also
// hard-blocks any item whose start_date/due_date falls outside its
// immediate parent's dates (the task's own dates for a top-level item, or
// the parent subtask's dates for a nested one) — owner_id has no such
// restriction, per the client's "owner can be anyone with an account"
// request.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    const body = await req.json();
    const parentId: string | null = body.parent_id ?? null;
    const items: { id?: string; title: string; weight_percent: number; owner_id?: string | null; start_date?: string | null; due_date?: string | null }[] =
      Array.isArray(body.items) ? body.items : [];

    const { data: task, error: taskError } = await supabaseAdmin.from("tm_tasks").select("*").eq("id", id).single();
    if (taskError || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    // Figure out this group's depth from its parent (1 = top-level), the
    // date bounds every item in this group must fall within — the task's own
    // dates for a top-level group, or the parent subtask's dates one level up
    // — and the weight these items must sum to. weight_percent is absolute
    // (each item's own share of the WHOLE task, not of its immediate
    // parent — see computeNodeCompletion), so a top-level group still sums
    // to 100 (the task's own "weight"), but a nested group sums to its
    // parent subtask's own weight_percent instead.
    let depth = 1;
    let boundStart: string | null = task.start_date ?? null;
    let boundEnd: string | null = task.due_date ?? null;
    let targetTotal = 100;
    if (parentId) {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("tm_subtasks")
        .select("id, depth, weight_percent, start_date, due_date")
        .eq("id", parentId)
        .eq("task_id", id)
        .single();
      if (parentError || !parent) return NextResponse.json({ error: "Parent subtask not found" }, { status: 404 });
      depth = parent.depth + 1;
      boundStart = parent.start_date ?? null;
      boundEnd = parent.due_date ?? null;
      targetTotal = parent.weight_percent;
    }
    if (items.length > 0 && depth > MAX_SUBTASK_DEPTH) {
      return NextResponse.json({ error: `Subtasks can only nest ${MAX_SUBTASK_DEPTH} levels deep` }, { status: 400 });
    }

    for (const item of items) {
      if (!item.title || !item.title.trim()) return NextResponse.json({ error: "Every subtask needs a name" }, { status: 400 });
      if (!Number.isFinite(item.weight_percent) || item.weight_percent < 1 || item.weight_percent > targetTotal) {
        return NextResponse.json(
          { error: `Each subtask's percentage must be between 1 and ${targetTotal}` },
          { status: 400 },
        );
      }
      if (item.start_date && item.due_date && item.due_date < item.start_date) {
        return NextResponse.json({ error: `"${item.title}"'s due date can't be earlier than its start date` }, { status: 400 });
      }
      if (!isDateWithin(item.start_date, boundStart, boundEnd) || !isDateWithin(item.due_date, boundStart, boundEnd)) {
        const boundLabel = parentId ? "its parent subtask's" : "the task's";
        return NextResponse.json({ error: `"${item.title}"'s dates must fall within ${boundLabel} start and due dates` }, { status: 400 });
      }
    }
    if (items.length > 0 && sumWeights(items) !== targetTotal) {
      return NextResponse.json(
        { error: `These percentages must add up to exactly ${targetTotal} (currently ${sumWeights(items)})` },
        { status: 400 },
      );
    }

    const parentFilter = parentId ? { parent_id: parentId } : null;
    let existingQuery = supabaseAdmin.from("tm_subtasks").select("id").eq("task_id", id);
    existingQuery = parentFilter ? existingQuery.eq("parent_id", parentId) : existingQuery.is("parent_id", null);
    const { data: existingSiblings, error: existingError } = await existingQuery;
    if (existingError) throw existingError;

    const incomingIds = new Set(items.filter((i) => i.id).map((i) => i.id));
    const idsToDelete = (existingSiblings ?? []).map((r) => r.id).filter((existingId) => !incomingIds.has(existingId));
    if (idsToDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin.from("tm_subtasks").delete().in("id", idsToDelete);
      if (deleteError) throw deleteError;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.id) {
        const { error: updateError } = await supabaseAdmin
          .from("tm_subtasks")
          .update({
            title: item.title.trim(),
            weight_percent: Math.round(item.weight_percent),
            owner_id: item.owner_id ?? null,
            start_date: item.start_date ?? null,
            due_date: item.due_date ?? null,
            position: i,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("task_id", id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabaseAdmin.from("tm_subtasks").insert([
          {
            task_id: id,
            parent_id: parentId,
            title: item.title.trim(),
            weight_percent: Math.round(item.weight_percent),
            owner_id: item.owner_id ?? null,
            start_date: item.start_date ?? null,
            due_date: item.due_date ?? null,
            depth,
            position: i,
          },
        ]);
        if (insertError) throw insertError;
      }
    }

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
    // See the matching comment in subtasks/[subtaskId]/route.ts — sent back
    // so the client can patch its cached task-list query directly rather
    // than depending solely on a background refetch to pick up the new
    // progress_percent/display_status.
    let updatedTask: unknown = null;
    if (rollup !== null) {
      const result = await updateTaskProgress(id, rollup, user, { allowReopen: true });
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      recurred = !!result.recurred;
      nextDueDate = result.next_due_date ?? null;
      updatedTask = result.task ?? null;

      if (recurred) {
        // Same reset as the leaf-tick route (subtasks/[subtaskId]/route.ts)
        // — editing a group's structure can also land the rollup on 100%
        // (e.g. renaming/reweighting without unchecking anything already
        // done), which cycles the task forward the same way ticking the
        // last box does. Reset every checkbox for the new cycle rather
        // than leaving them ticked from the cycle that just closed.
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
    console.error("[PUT /api/task-manager/tasks/[id]/subtasks]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
