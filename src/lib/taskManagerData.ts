import { supabaseAdmin, type RequestUser } from "@/lib/taskManagerAuth";
import { computeDisplayStatus } from "@/lib/taskAccessControl";
import { computeNextDueDate, addDaysUTC, daysBetweenUTC } from "@/lib/taskRecurrence";
import { buildSubtaskTree, computeSubtaskGroupStatus } from "@/lib/subtaskProgress";
import type { TMTask, TMSubtask, AuditAction, ProjectAuditAction } from "@/types/taskManager";

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

/**
 * Attaches owner_name + the computed display_status (and, optionally,
 * project_name / has_subtasks) to raw task rows.
 *
 * `subtaskTrees` — when passed — lets a task with subtasks get its
 * display_status from computeSubtaskGroupStatus instead of the ordinary
 * due-date-driven computeDisplayStatus, per the client's rule that a task's
 * own due date stops driving its status once it has subtasks. lifecycle
 * still wins either way (a deleted/archived/completed task shows that,
 * regardless of what its subtasks say) — computeDisplayStatus already
 * short-circuits on lifecycle_status before it ever looks at due_date, so
 * that's reused here for the "does lifecycle override?" check rather than
 * duplicating it.
 *
 * Only the list route (GET /api/task-manager/tasks) currently passes
 * subtaskTrees — the same caveat as has_subtasks already documented on
 * TMTask applies here too: other routes that return a single task default
 * to the plain due-date status, since the client always refetches the list
 * afterward anyway.
 */
export function enrichTasks(
  tasks: any[],
  userNames: Record<string, string>,
  projectNames?: Record<string, string>,
  subtaskTrees?: Map<string, TMSubtask[]>,
): TMTask[] {
  return tasks.map((t) => {
    const tree = subtaskTrees?.get(t.id);
    const dueDateStatus = computeDisplayStatus(t.due_date, t.lifecycle_status, t.is_recurring, t.progress_percent);
    const lifecycleOverrides = t.lifecycle_status !== "active";
    const subtaskStatus = !lifecycleOverrides && tree && tree.length > 0 ? computeSubtaskGroupStatus(tree) : null;
    // subtaskStatus wins whenever it says something the due-date-only
    // calculation couldn't know on its own (Overdue from a specific
    // subtask, Completed, or a partial In Progress) — but "Not Started"
    // just means "nothing ticked yet", which the due-date calculation
    // already handles more precisely, including recognizing a recurring
    // task that isn't due yet as "Compliant / Ongoing" rather than flatly
    // "Not Started" (computeGroupStatus has no concept of "recurring" at
    // all, so left alone it would always show "Not Started" here instead —
    // e.g. right after a recurring task resets for a new cycle).
    const resolvedStatus = subtaskStatus && subtaskStatus !== "Not Started" ? subtaskStatus : dueDateStatus;

    return {
      ...t,
      owner_name: t.owner_id ? (userNames[t.owner_id] ?? "Unknown") : null,
      display_status: resolvedStatus,
      ...(projectNames ? { project_name: projectNames[t.project_id] ?? null } : {}),
      has_subtasks: !!tree && tree.length > 0,
    };
  });
}

/**
 * Enriches a single already-written task row, correctly reflecting its
 * subtask tree's rollup (Overdue/Completed/In Progress/etc.) if it has one
 * — every route that returns a task right after touching its progress,
 * lifecycle, or fields needs this, not just the plain task-list GET route.
 * Without it, the returned task's display_status silently falls back to the
 * due-date-only calculation and ignores whatever its subtasks actually say
 * (e.g. a subtask that's Overdue not showing up on the task itself until
 * something else happens to trigger a full list refetch).
 */
export async function enrichSingleTask(task: any, userNames: Record<string, string>): Promise<TMTask> {
  const trees = await fetchSubtaskTreesByTaskId([task.id]);
  return enrichTasks([task], userNames, undefined, trees)[0];
}

/**
 * Fetches every subtask row for the given task ids and groups them into a
 * per-task tree (task_id -> nested TMSubtask[], statuses already attached —
 * see attachSubtaskStatuses). A task id with no subtask rows simply has no
 * entry in the returned map. Used by the tasks list route so enrichTasks can
 * derive both has_subtasks and the subtask-aggregated display_status without
 * a second round trip per task.
 */
export async function fetchSubtaskTreesByTaskId(taskIds: string[]): Promise<Map<string, TMSubtask[]>> {
  const uniqueIds = [...new Set(taskIds.filter(Boolean))];
  const map = new Map<string, TMSubtask[]>();
  if (uniqueIds.length === 0) return map;

  const { data } = await supabaseAdmin
    .from("tm_subtasks")
    .select("*")
    .in("task_id", uniqueIds)
    .order("position", { ascending: true });

  const byTask = new Map<string, any[]>();
  for (const row of data ?? []) {
    if (!byTask.has(row.task_id)) byTask.set(row.task_id, []);
    byTask.get(row.task_id)!.push(row);
  }
  for (const [taskId, rows] of byTask) {
    map.set(taskId, buildSubtaskTree(rows));
  }
  return map;
}

/** Every owner_id used anywhere in a subtask tree (any depth), for a single fetchUserNames call. */
export function collectSubtaskOwnerIds(nodes: TMSubtask[]): string[] {
  const ids: string[] = [];
  const walk = (list: TMSubtask[]) => {
    for (const n of list) {
      if (n.owner_id) ids.push(n.owner_id);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

/** Stamps owner_name onto every node in a subtask tree, same idea as enrichTasks does for a task's owner_id. */
export function attachSubtaskOwnerNames(nodes: TMSubtask[], userNames: Record<string, string>): TMSubtask[] {
  return nodes.map((n) => ({
    ...n,
    owner_name: n.owner_id ? (userNames[n.owner_id] ?? "Unknown") : null,
    children: n.children ? attachSubtaskOwnerNames(n.children, userNames) : n.children,
  }));
}

const LIFECYCLE_ACTION_TO_STATUS: Record<string, string> = {
  archived: "archived",
  deleted: "deleted",
  completed: "completed",
  restored: "active",
};

/**
 * Shifts every subtask's (and sub-subtask's, at every depth) own start_date
 * and due_date forward by `deltaDays` — the same number of days the task's
 * own start date just moved — and resets is_done back to false, ready for
 * the new cycle. E.g. a task whose window was 12th-19th resets to 17th-24th
 * (deltaDays = 5); a subtask that was 13th-15th shifts to 18th-20th, and a
 * sub-subtask that was 13th-14th shifts to 18th-19th — same delta, every
 * level, so every node keeps the exact same position relative to the task's
 * own window that it had before.
 */
async function shiftAndResetSubtasks(
  taskId: string,
  rows: { id: string; start_date: string | null; due_date: string | null }[],
  deltaDays: number,
) {
  for (const row of rows) {
    const { error } = await supabaseAdmin
      .from("tm_subtasks")
      .update({
        is_done: false,
        start_date: row.start_date ? addDaysUTC(row.start_date, deltaDays) : row.start_date,
        due_date: row.due_date ? addDaysUTC(row.due_date, deltaDays) : row.due_date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("task_id", taskId);
    if (error) throw error;
  }
}

/**
 * What "marking a task complete" actually does — shared by the explicit
 * Complete button (applyLifecycleChange) and hitting 100% on the progress
 * slider (updateTaskProgress), so the two paths can't drift apart.
 *
 * For an ordinary task this is just "close it out": lifecycle_status ->
 * completed, progress -> 100, completed_at stamped.
 *
 * A task with subtasks can only complete (or recur) once every one of them
 * — down to the last sub-subtask — is actually ticked: `currentProgress`
 * (the task's own progress_percent, which the subtask routes keep in
 * lockstep with the live subtask rollup) has to already be 100 whenever any
 * subtasks exist. Without this, the manual Complete button
 * (applyLifecycleChange) could force a task to recur — or close — while
 * subtasks were still outstanding, silently abandoning them mid-cycle; the
 * ordinary subtask-ticking path (updateTaskProgress) can never actually hit
 * this, since it only ever calls this function once the rollup itself has
 * already reached 100 (which is only mathematically possible once every
 * leaf is done).
 *
 * For a recurring task (is_recurring = true) whose `frequency` text is
 * recognizable (see taskRecurrence.ts), it does NOT close — the same task
 * row cycles instead: progress resets to 0, lifecycle_status stays active,
 * start_date becomes the day it was marked complete, and due_date is that
 * SAME new start_date with one frequency interval added — so a task
 * finished early still gets a full fresh interval from today, rather than
 * jumping to wherever the old due date plus an interval would land. This
 * cycle's completion is preserved in tm_task_completions (so reporting
 * doesn't lose it just because the task itself didn't stay "completed").
 *
 * Any subtasks (any depth) shift forward by the same rule Sheila specified:
 * every one of their own start/due dates moves by exactly the same number
 * of days the task's own start date just moved — see
 * shiftAndResetSubtasks — and their checkboxes reset for the new cycle.
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
async function performTaskCompletion(existing: any, performedBy: RequestUser, currentProgress: number) {
  const { data: subtaskRows, error: subtaskFetchError } = await supabaseAdmin
    .from("tm_subtasks")
    .select("id, start_date, due_date")
    .eq("task_id", existing.id);
  if (subtaskFetchError) throw subtaskFetchError;
  const hasSubtasks = (subtaskRows ?? []).length > 0;

  if (hasSubtasks && currentProgress < 100) {
    return { error: "Every subtask must be marked complete before this task can be completed." };
  }

  const isHourly = existing.is_recurring && !!existing.due_date && (existing.frequency ?? "").trim().toLowerCase() === "hourly";
  const newStartDate = new Date().toISOString().slice(0, 10);
  const nextDueDate = isHourly
    ? existing.due_date
    : existing.is_recurring && existing.due_date
      ? computeNextDueDate(newStartDate, existing.frequency)
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

    if (hasSubtasks) {
      // No start_date on the task to measure a shift from (unusual, but
      // possible) — still reset every checkbox for the new cycle, just
      // without moving any dates (delta 0).
      const deltaDays = existing.start_date ? daysBetweenUTC(existing.start_date, newStartDate) : 0;
      await shiftAndResetSubtasks(existing.id, subtaskRows ?? [], deltaDays);
    }

    return {
      updates: {
        due_date: nextDueDate,
        start_date: newStartDate,
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
    const result = await performTaskCompletion(existing, performedBy, existing.progress_percent);
    if ("error" in result) return { error: result.error, status: 400 as const };
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
  return { task: await enrichSingleTask(updated, userNames), recurred, next_due_date: nextDueDate };
}

/**
 * Updates just progress_percent — the one field the task's owner is allowed
 * to touch themselves, without full edit permission. Hitting 100 auto-
 * completes the task (same effect as Senior Management clicking Complete).
 * Caller is responsible for the owner-or-Senior-Management permission check.
 *
 * `allowReopen` — set by the subtask routes (see subtasks/route.ts and
 * subtasks/[subtaskId]/route.ts), never by the plain manual-slider route.
 * A task with subtasks auto-completes the moment its rollup hits 100%
 * (lifecycle_status -> "completed"), same as this function's own
 * autoCompleting branch below. Unchecking a subtask afterward recomputes a
 * LOWER rollup — without this flag, the guard right below would reject that
 * write outright because the task is no longer "active", silently freezing
 * the main progress bar at 100% even though the reviewer just unticked
 * something. allowReopen lets that one case through and back into the
 * ordinary non-autoCompleting branch, which already sets lifecycle_status
 * back to "active" and clears completed_at — i.e. it un-completes the task
 * to match what the subtasks now actually show. A task that's archived or
 * deleted (an explicit lifecycle action, not just a rollup side effect)
 * still can't have its progress touched this way.
 */
export async function updateTaskProgress(taskId: string, rawProgress: number, performedBy: RequestUser, options?: { allowReopen?: boolean }) {
  const progress = Math.max(0, Math.min(100, Math.round(rawProgress)));

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("tm_tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (fetchError || !existing) return { error: "Task not found", status: 404 as const };
  const canReopen = options?.allowReopen && existing.lifecycle_status === "completed" && progress < 100;
  if (existing.lifecycle_status !== "active" && !canReopen) {
    return { error: "Only active tasks can have their progress updated", status: 400 as const };
  }
  if (existing.lifecycle_status === "active" && existing.progress_percent === progress) {
    const userNames = await fetchUserNames([existing.owner_id]);
    return { task: await enrichSingleTask(existing, userNames) };
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
    // the caller's `progress` value only matters for getting here. Passed
    // as the "current progress" too — this branch only runs once `progress`
    // itself is already >= 100, so the has-subtasks gate inside never
    // actually blocks a legitimate last-subtask tick.
    const result = await performTaskCompletion(existing, performedBy, progress);
    if ("error" in result) return { error: result.error, status: 400 as const };
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
  return { task: await enrichSingleTask(updated, userNames), recurred, next_due_date: nextDueDate };
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

/** Mirrors writeAuditLog above, but for tm_project_audit_log — see projects/route.ts and projects/[id]/route.ts for call sites. */
export async function writeProjectAuditLog(params: {
  project_id: string;
  action: ProjectAuditAction;
  changed_fields?: string[];
  previous_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  performedBy: RequestUser;
}) {
  const { error } = await supabaseAdmin.from("tm_project_audit_log").insert([
    {
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
  if (error) console.error("[writeProjectAuditLog]", error);
}
