import type { DisplayStatus, LifecycleStatus } from "@/types/taskManager";

/**
 * Senior Management = admin, manager, or super_admin.
 * Same set of roles the Leave page already treats as "admin/manager" for its
 * my-view/admin-view toggle — kept consistent rather than inventing a new
 * permission tier.
 *
 * Only Senior Management can create, edit, archive, delete, or restore
 * tasks and projects. Everyone else is read-only, scoped to their own tasks
 * (see scopeTasksForViewer in the API routes).
 */
export function isSeniorManagement(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "super_admin";
}

/**
 * The status shown on a task is never set by hand — it's computed from the
 * due date (and lifecycle_status) every time the task is read, per Sheila's
 * explicit instruction that status auto-updates rather than being an
 * editable field.
 *
 * Heuristic:
 *   - lifecycle_status overrides everything once it leaves "active"
 *   - no due date yet                        -> Not Started
 *   - recurring/monitoring task, due date has
 *     passed                                 -> Overdue
 *   - recurring/monitoring task, on schedule  -> Compliant / Ongoing
 *   - one-off task, due date has passed       -> Overdue
 *   - one-off task, due within 14 days        -> In Progress
 *   - one-off task, due further out           -> Not Started
 */
export function computeDisplayStatus(
  dueDate: string | null | undefined,
  lifecycleStatus: LifecycleStatus,
  isRecurring: boolean,
): DisplayStatus {
  if (lifecycleStatus === "deleted") return "Deleted";
  if (lifecycleStatus === "archived") return "Archived";
  if (lifecycleStatus === "completed") return "Completed";

  if (!dueDate) return "Not Started";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const overdue = due.getTime() < today.getTime();

  if (isRecurring) {
    return overdue ? "Overdue" : "Compliant / Ongoing";
  }

  if (overdue) return "Overdue";

  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (daysUntilDue <= 14) return "In Progress";

  return "Not Started";
}

/** Fields on a task that Senior Management is allowed to edit inline. Status is deliberately excluded — it's computed, never written. */
export const EDITABLE_TASK_FIELDS = [
  "title",
  "owner_id",
  "due_date",
  "description",
  "frequency",
  "indicator",
  "method_provider",
] as const;

export type EditableTaskField = (typeof EDITABLE_TASK_FIELDS)[number];
