import { supabaseAdmin, type RequestUser } from "@/lib/taskManagerAuth";
import { computeDisplayStatus } from "@/lib/taskAccessControl";
import type { TMTask, AuditAction } from "@/types/taskManager";

/** Looks up display names for a set of user ids from the `users` table. */
export async function fetchUserNames(userIds: string[]): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const { data } = await supabaseAdmin
    .from("users")
    .select("user_id, first_name, last_name")
    .in("user_id", uniqueIds);

  const map: Record<string, string> = {};
  for (const u of data ?? []) {
    map[u.user_id] = `${u.first_name} ${u.last_name}`.trim();
  }
  return map;
}

/** Attaches owner_name + the computed display_status to raw task rows. */
export function enrichTasks(
  tasks: any[],
  userNames: Record<string, string>,
): TMTask[] {
  return tasks.map((t) => ({
    ...t,
    owner_name: t.owner_id ? (userNames[t.owner_id] ?? "Unknown") : null,
    display_status: computeDisplayStatus(t.due_date, t.lifecycle_status, t.is_recurring),
  }));
}

const LIFECYCLE_ACTION_TO_STATUS: Record<string, string> = {
  archived: "archived",
  deleted: "deleted",
  completed: "completed",
  restored: "active",
};

/**
 * Shared implementation for archive / delete / complete / restore — they're
 * all "flip lifecycle_status and log it" with the same shape.
 */
export async function applyLifecycleChange(
  taskId: string,
  action: "archived" | "deleted" | "completed" | "restored",
  performedBy: RequestUser,
) {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("tm_tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (fetchError || !existing) return { error: "Task not found", status: 404 as const };

  const nextStatus = LIFECYCLE_ACTION_TO_STATUS[action];
  const updates: Record<string, unknown> = {
    lifecycle_status: nextStatus,
    updated_at: new Date().toISOString(),
    completed_at: action === "completed" ? new Date().toISOString() : action === "restored" ? null : existing.completed_at,
  };

  const { data: updated, error } = await supabaseAdmin
    .from("tm_tasks")
    .update(updates)
    .eq("id", taskId)
    .select()
    .single();
  if (error) return { error: error.message, status: 500 as const };

  await writeAuditLog({
    task_id: updated.id,
    project_id: updated.project_id,
    action,
    changed_fields: ["lifecycle_status"],
    previous_values: { lifecycle_status: existing.lifecycle_status },
    new_values: { lifecycle_status: updated.lifecycle_status },
    performedBy,
  });

  const userNames = await fetchUserNames([updated.owner_id]);
  return { task: enrichTasks([updated], userNames)[0] };
}

export async function writeAuditLog(params: {
  task_id: string;
  project_id: string;
  action: AuditAction;
  changed_fields?: string[];
  previous_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  performedBy: RequestUser;
}) {
  const { error } = await supabaseAdmin.from("tm_task_audit_log").insert([
    {
      task_id: params.task_id,
      project_id: params.project_id,
      action: params.action,
      changed_fields: params.changed_fields ?? null,
      previous_values: params.previous_values ?? null,
      new_values: params.new_values ?? null,
      performed_by: params.performedBy.id,
      performed_by_name: params.performedBy.name,
      performed_at: new Date().toISOString(),
    },
  ]);
  if (error) console.error("[writeAuditLog]", error);
}
