import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireSeniorManagement } from "@/lib/taskManagerAuth";
import { EDITABLE_TASK_FIELDS, type EditableTaskField } from "@/lib/taskAccessControl";
import { enrichTasks, fetchUserNames, writeAuditLog } from "@/lib/taskManagerData";

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
      return NextResponse.json({ task: enrichTasks([existing], userNames)[0] });
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
      .from("tm_tasks")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    await writeAuditLog({
      task_id: updated.id,
      project_id: updated.project_id,
      action: "edited",
      changed_fields: changedFields,
      previous_values: previousValues,
      new_values: newValues,
      performedBy: user,
    });

    const userNames = await fetchUserNames([updated.owner_id]);
    return NextResponse.json({ task: enrichTasks([updated], userNames)[0] });
  } catch (err: any) {
    console.error("[PATCH /api/task-manager/tasks/[id]]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
