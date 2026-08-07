import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireSeniorManagement } from "@/lib/taskManagerAuth";
import { updateTaskProgress } from "@/lib/taskManagerData";
import { buildSubtaskTree, computeTaskRollup, MAX_SUBTASK_DEPTH, sumWeights } from "@/lib/subtaskProgress";

// GET /api/task-manager/tasks/[id]/subtasks — the full nested tree for a task.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data: rows, error } = await supabaseAdmin
      .from("tm_subtasks")
      .select("*")
      .eq("task_id", id)
      .order("position", { ascending: true });
    if (error) throw error;

    return NextResponse.json({ subtasks: buildSubtaskTree(rows ?? []) });
  } catch (err: any) {
    console.error("[GET /api/task-manager/tasks/[id]/subtasks]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

// PUT /api/task-manager/tasks/[id]/subtasks — Senior Management only.
// Replaces one whole sibling group at once: { parent_id, items: [{ id?, title, weight_percent }] }.
// parent_id: null for the task's top-level subtasks, or an existing subtask's
// id to replace ITS children (one level deeper). items with an `id` are
// updated in place (their own children, if any, are left untouched); items
// without one are created; any existing sibling not present in `items` is
// deleted (cascading to its own children — removing a subtask removes
// whatever was nested under it too). An empty items array deletes the whole
// group, which is how a task drops subtasks entirely and falls back to the
// manual progress slider.
//
// Hard-blocks the save unless the incoming weights sum to exactly 100 (per
// Sheila's explicit choice) — the only exception is submitting an empty
// group, which has nothing to sum.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    const body = await req.json();
    const parentId: string | null = body.parent_id ?? null;
    const items: { id?: string; title: string; weight_percent: number }[] = Array.isArray(body.items) ? body.items : [];

    const { data: task, error: taskError } = await supabaseAdmin.from("tm_tasks").select("*").eq("id", id).single();
    if (taskError || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    // Figure out this group's depth from its parent (1 = top-level).
    let depth = 1;
    if (parentId) {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("tm_subtasks")
        .select("id, depth")
        .eq("id", parentId)
        .eq("task_id", id)
        .single();
      if (parentError || !parent) return NextResponse.json({ error: "Parent subtask not found" }, { status: 404 });
      depth = parent.depth + 1;
    }
    if (items.length > 0 && depth > MAX_SUBTASK_DEPTH) {
      return NextResponse.json({ error: `Subtasks can only nest ${MAX_SUBTASK_DEPTH} levels deep` }, { status: 400 });
    }

    for (const item of items) {
      if (!item.title || !item.title.trim()) return NextResponse.json({ error: "Every subtask needs a name" }, { status: 400 });
      if (!Number.isFinite(item.weight_percent) || item.weight_percent < 1 || item.weight_percent > 100) {
        return NextResponse.json({ error: "Each subtask's percentage must be between 1 and 100" }, { status: 400 });
      }
    }
    if (items.length > 0 && sumWeights(items) !== 100) {
      return NextResponse.json({ error: `These percentages must add up to exactly 100 (currently ${sumWeights(items)})` }, { status: 400 });
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
          .update({ title: item.title.trim(), weight_percent: Math.round(item.weight_percent), position: i, updated_at: new Date().toISOString() })
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
    if (rollup !== null) {
      const result = await updateTaskProgress(id, rollup, user);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      recurred = !!result.recurred;
      nextDueDate = result.next_due_date ?? null;
    }

    return NextResponse.json({ subtasks: tree, recurred, next_due_date: nextDueDate });
  } catch (err: any) {
    console.error("[PUT /api/task-manager/tasks/[id]/subtasks]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
