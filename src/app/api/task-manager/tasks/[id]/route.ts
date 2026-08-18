import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireSeniorManagement } from "@/lib/taskManagerAuth";
import { EDITABLE_TASK_FIELDS, type EditableTaskField } from "@/lib/taskAccessControl";
import { enrichSingleTask, fetchUserNames, writeAuditLog } from "@/lib/taskManagerData";

// PATCH /api/task-manager/tasks/[id] — Senior Management only.
// Only title, owner_id, due_date, description, frequency, indicator,
// method_provider are writable — status is never accepted here, it's always
// computed. Every change is logged with a before/after diff.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    const body = await req.json();
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("tm_tasks")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchError || !existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const updates: Record<string, unknown> = {};
    const changedFields: string[] = [];
    const previousValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    for (const field of EDITABLE_TASK_FIELDS as readonly EditableTaskField[]) {
      if (!(field in body)) continue;
      const nextValue = body[field];
      if (nextValue === existing[field]) continue;
      updates[field] = nextValue;
      changedFields.push(field);
      previousValues[field] = existing[field];
      newValues[field] = nextValue;
    }

    if (changedFields.length === 0) {
      const userNames = await fetchUserNames([existing.owner_id]);
      return NextResponse.json({ task: await enrichSingleTask(existing, userNames) });
    }

    // Moving a task between the Obligation Register and Monitoring
    // Schedule tabs (see the "Move to" selector in TaskRow.tsx) has to keep
    // the same invariants the rest of the app assumes — monitoring items
    // are always recurring, and indicator/method_provider are monitoring-
    // only concepts (a stray value on an obligation task is exactly the
    // garbage-text-under-the-wrong-tab bug fixed earlier). The client
    // already sends consistent values for its own request, this is just
    // the same backstop the AI-extraction save route uses, applied here so
    // the invariant holds no matter what called this route.
    if (changedFields.includes("task_type")) {
      if (updates.task_type === "monitoring") {
        updates.is_recurring = true;
      } else if (updates.task_type === "obligation") {
        updates.indicator = null;
        updates.method_provider = null;
      }
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
      .from("tm_tasks")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    // project_id moved as part of this edit — a raw before/after UUID pair
    // means nothing on the History drawer, so swap in the actual project
    // names for the audit entry only (the real DB update above already
    // used the id, which is what matters for the move itself).
    if (changedFields.includes("project_id")) {
      const { data: projectRows } = await supabaseAdmin
        .from("tm_projects")
        .select("id, name")
        .in("id", [previousValues.project_id, newValues.project_id]);
      const nameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));
      previousValues.project_id = nameById.get(previousValues.project_id as string) ?? previousValues.project_id;
      newValues.project_id = nameById.get(newValues.project_id as string) ?? newValues.project_id;
    }

    await writeAuditLog({
      task_id: updated.id,
      // The audit row's own project_id always reflects the task's current
      // (post-move) project — the previous_values/new_values diff above is
      // what actually shows the "moved from X to Y" text.
      project_id: updated.project_id,
      action: "edited",
      changed_fields: changedFields,
      previous_values: previousValues,
      new_values: newValues,
      performedBy: user,
    });

    const userNames = await fetchUserNames([updated.owner_id]);
    return NextResponse.json({ task: await enrichSingleTask(updated, userNames) });
  } catch (err: any) {
    console.error("[PATCH /api/task-manager/tasks/[id]]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
