import { supabaseAdmin, type RequestUser } from "@/lib/taskManagerAuth";
import { computeDisplayStatus } from "@/lib/taskAccessControl";
import { computeNextDueDate } from "@/lib/taskRecurrence";
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

/** Looks up project names for a set of project ids from the `tm_projects` table. */
export async function fetchProjectNames(projectIds: string[]): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(projectIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const { data } = await supabaseAdmin.from("tm_projects").select("id, name").in("id", uniqueIds);

  const map: Record<string, string> = {};
  for (const p of data ?? []) map[p.id] = p.name;
  return map;
}

/** Attaches owner_name + the computed display_status (and, optionally, project_name / has_subtasks) to raw task rows. */
export function enrichTasks(
  tasks: any[],
  userNames: Record<string, string>,
  projectNames?: Record<string, string>,
  subtaskTaskIds?: Set<string>,
): TMTask[] {
  return tasks.map((t) => ({
    ...t,
    owner_name: t.owner_id ? (userNames[t.owner_id] ?? "Unknown") : null,
    display_status: computeDisplayStatus(t.due_date, t.lifecycle_status, t.is_recurring, t.progress_percent),
    ...(projectNames ? { project_name: projectNames[t.project_id] ?? null } : {}),
    has_subtasks: subtaskTaskIds ? subtaskTaskIds.has(t.id) : false,
  }));
}

/** Which of the given task ids have at least one subtask row (any depth). Used to decide whether a task's progress is subtask-driven. */
export async function fetchTaskIdsWithSubtasks(taskIds: string[]): Promise<Set<string>> {
  const uniqueIds = [...new Set(taskIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Set();

  const { data } = await supabaseAdmin.from("tm_subtasks").select("task_id").in("task_id", uniqueIds);
  return new Set((data ?? []).map((r) => r.task_id));
}

const LIFECYCLE_ACTION_TO_STATUS: Record<string, string> = {
  archived: "archived",
  deleted: "deleted",
  completed: "completed",
  restored: "active",
};

/**
 * What "marking a task complete" actually does — shared by the explicit
 * Complete button (applyLifecycleChange) and hitting 100% on the progress
 * slider (updateTaskProgress), so the two paths can't drift apart.
 *
 * For an ordinary task this is just "close it out": lifecycle_status ->
 * completed, progress -> 100, completed_at stamped.
 *
 * For a recurring task (is_recurring = true) whose `frequency` text is
 * recognizable (see taskRecurrence.ts), it does NOT close — the same task
 * row cycles instead: progress resets to 0, lifecycle_status stays active,
 * and (per Sheila's explicit choice) the new cycle's start_date is the day
 * it was marked complete, while due_date is computed from frequency applied
 * to the PREVIOUS due_date (not from today) — so a monthly task due the
 * 1st stays due the 1st every cycle, regardless of when it's actually
 * ticked. This cycle's completion is preserved in tm_task_completions (so
 * reporting doesn't lose it just because the task itself didn't stay
 * "completed").
 *
 * "Hourly" is a deliberate special case, handled here rather than through
 * computeNextDueDate: due_date is a day (not a time), so there's no
 * sensible per-hour interval to advance it by, and a task genuinely due
 * hourly can be ticked complete many times in the same day — each tick
 * should just reset progress and stay due TODAY, not jump to tomorrow.
 * due_date only ever moves forward for an Hourly task via the separate
 * close-of-business rollover cron (src/app/api/task-manager/cron/
 * hourly-rollover/route.ts), which runs once daily and isn't triggered by
 * completion at all.
 *
 * If is_recurring is true but the frequency text isn't recognizable (and
 * isn't "Hourly"), this falls back to the ordinary close-it-out behavior —
 * silently guessing at a cadence would be worse than just completing it
 * normally.
 */
async function performTaskCompletion(existing: any, performedBy: RequestUser) {
  const isHourly = existing.is_recurring && !!existing.due_date && (existing.frequency ?? "").trim().toLowerCase() === "hourly";
  const nextDueDate = isHourly
    ? existing.due_date
    : existing.is_recurring && existing.due_date
      ? computeNextDueDate(existing.due_date, existing.frequency)
      : null;

  if (nextDueDate) {
    await supabaseAdmin.from("tm_task_completions").insert([
      {
        task_id: existing.id,
        project_id: existing.project_id,
        due_date: existing.due_date,
        completed_by: performedBy.id,
        completed_by_name: performedBy.name,
      },
    ]);

    return {
      updates: {
        due_date: nextDueDate,
        start_date: new Date().toISOString().slice(0, 10),
        progress_percent: 0,
        lifecycle_status: "active",
        completed_at: null,
        updated_at: new Date().toISOString(),
      },
      recurred: true,
      nextDueDate,
    };
  }

  return {
    updates: {
      lifecycle_status: "completed",
      progress_percent: 100,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    recurred: false,
    nextDueDate: null as string | null,
  };
}

/**
 * Shared implementation for archive / delete / complete / restore — they're
 * all "flip lifecycle_status and log it" with the same shape, except
 * "completed" is handed off to performTaskCompletion since it can mean
 * either closing the task or cycling it (see above).
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

  let updates: Record<string, unknown>;
  let recurred = false;
  let nextDueDate: string | null = null;

  if (action === "completed") {
    const result = await performTaskCompletion(existing, performedBy);
    updates = result.updates;
    recurred = result.recurred;
    nextDueDate = result.nextDueDate;
  } else {
    const nextStatus = LIFECYCLE_ACTION_TO_STATUS[action];
    updates = {
      lifecycle_status: nextStatus,
      updated_at: new Date().toISOString(),
      completed_at: action === "restored" ? null : existing.completed_at,
      progress_percent: action === "restored" ? 0 : existing.progress_percent,
    };
  }

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
    changed_fields: recurred ? ["due_date", "start_date", "progress_percent"] : ["lifecycle_status"],
    previous_values: recurred
      ? { due_date: existing.due_date, start_date: existing.start_date, progress_percent: existing.progress_percent }
      : { lifecycle_status: existing.lifecycle_status },
    new_values: recurred
      ? { due_date: updated.due_date, start_date: updated.start_date, progress_percent: updated.progress_percent }
      : { lifecycle_status: updated.lifecycle_status },
    performedBy,
  });

  const userNames = await fetchUserNames([updated.owner_id]);
  return { task: enrichTasks([updated], userNames)[0], recurred, next_due_date: nextDueDate };
}

/**
 * Updates just progress_percent — the one field the task's owner is allowed
 * to touch themselves, without full edit permission. Hitting 100 auto-
 * completes the task (same effect as Senior Management clicking Complete).
 * Caller is responsible for the owner-or-Senior-Management permission check.
 */
export async function updateTaskProgress(taskId: string, rawProgress: number, performedBy: RequestUser) {
  const progress = Math.max(0, Math.min(100, Math.round(rawProgress)));

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("tm_tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (fetchError || !existing) return { error: "Task not found", status: 404 as const };
  if (existing.lifecycle_status !== "active") {
    return { error: "Only active tasks can have their progress updated", status: 400 as const };
  }
  if (existing.progress_percent === progress) {
    const userNames = await fetchUserNames([existing.owner_id]);
    return { task: enrichTasks([existing], userNames)[0] };
  }

  const autoCompleting = progress >= 100;
  let updates: Record<string, unknown>;
  let recurred = false;
  let nextDueDate: string | null = null;

  if (autoCompleting) {
    // Hitting 100% completes the task the same way the Complete button
    // does — including cycling a recurring task forward instead of
    // closing it. existing.progress_percent is overwritten below by
    // performTaskCompletion's own updates (0 if recurred, 100 if not), so
    // the caller's `progress` value only matters for getting here.
    const result = await performTaskCompletion(existing, performedBy);
    updates = result.updates;
    recurred = result.recurred;
    nextDueDate = result.nextDueDate;
  } else {
    updates = {
      progress_percent: progress,
      updated_at: new Date().toISOString(),
      lifecycle_status: "active",
      completed_at: null,
    };
  }

  const { data: updated, error } = await supabaseAdmin.from("tm_tasks").update(updates).eq("id", taskId).select().single();
  if (error) return { error: error.message, status: 500 as const };

  await writeAuditLog({
    task_id: updated.id,
    project_id: updated.project_id,
    action: autoCompleting ? "completed" : "edited",
    changed_fields: autoCompleting ? (recurred ? ["due_date", "start_date", "progress_percent"] : ["progress_percent", "lifecycle_status"]) : ["progress_percent"],
    previous_values: { progress_percent: existing.progress_percent, ...(recurred ? { due_date: existing.due_date, start_date: existing.start_date } : {}) },
    new_values: { progress_percent: updated.progress_percent, ...(recurred ? { due_date: updated.due_date, start_date: updated.start_date } : {}) },
    performedBy,
  });

  const userNames = await fetchUserNames([updated.owner_id]);
  return { task: enrichTasks([updated], userNames)[0], recurred, next_due_date: nextDueDate };
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
