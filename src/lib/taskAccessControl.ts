import type { DisplayStatus, LifecycleStatus } from "@/types/taskManager";
import {
  hasBroadElevatedAccessByRoleLabel,
  isExecutiveRoleLabel,
  isHumanResourceRoleLabel,
  isSuperAdminRoleLabel,
} from "@/lib/userRoleAccessControl";

/**
 * Senior Management = Executive / Human Resource / Super Admin (see
 * hasBroadElevatedAccessByRoleLabel). System Administrator is not included
 * (cannot create tasks / approve leave). Supervisory Role is not included
 * here either — they can still create tasks for their assigned people via
 * users.supervisor_id (see POST /api/task-manager/tasks).
 *
 * Only Senior Management can create, edit, archive, delete, or restore
 * tasks and projects. Everyone else is read-only; read scope is in
 * taskManagerScope.ts (supervisory = direct reports, others = own + created).
 */

export function isSeniorManagement(role: string | null | undefined): boolean {
  return hasBroadElevatedAccessByRoleLabel(role);
}

/**
 * Whether someone can SEE every task/project (not just their own). Super
 * Admin, Executive Role, and Human Resource see all by role; everyone
 * else needs the per-user `tm_can_view_all_tasks` grant (Users page).
 * Supervisory Role uses report-scoped visibility (see taskManagerScope.ts).
 */
export function canViewAllTasks(
  role: string | null | undefined,
  tmCanViewAllTasks: boolean | null | undefined,
): boolean {
  if (isSuperAdminRoleLabel(role)) return true;
  if (isExecutiveRoleLabel(role)) return true;
  if (isHumanResourceRoleLabel(role)) return true;
  return !!tmCanViewAllTasks;
}

/**
 * The status shown on a task is never set by hand — it's computed every time
 * the task is read, from the due date, lifecycle_status, and (now) the
 * owner-reported progress percentage.
 *
 * Heuristic:
 *   - lifecycle_status overrides everything once it leaves "active"
 *     (progress hitting 100 flips lifecycle_status to "completed" server-side
 *     — see the /tasks/[id]/progress route — so this and the progress check
 *     below rarely disagree, but lifecycle still wins if they ever do)
 *   - due date has passed                     -> Overdue, regardless of
 *                                                 partial progress — the
 *                                                 deadline still matters
 *   - progress > 0 (and not overdue)           -> In Progress
 *   - no due date yet and no progress          -> Not Started
 *   - recurring/monitoring task, on schedule    -> Compliant / Ongoing
 *   - one-off task, due within 14 days          -> In Progress
 *   - one-off task, due further out             -> Not Started
 */
export function computeDisplayStatus(
  dueDate: string | null | undefined,
  lifecycleStatus: LifecycleStatus,
  isRecurring: boolean,
  progressPercent?: number | null,
): DisplayStatus {
  if (lifecycleStatus === "deleted") return "Deleted";
  if (lifecycleStatus === "archived") return "Archived";
  if (lifecycleStatus === "completed") return "Completed";

  const progress = progressPercent ?? 0;

  if (!dueDate) {
    return progress > 0 ? "In Progress" : "Not Started";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const overdue = due.getTime() < today.getTime();

  if (overdue) return "Overdue";

  if (progress > 0) return "In Progress";

  if (isRecurring) return "Compliant / Ongoing";

  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (daysUntilDue <= 14) return "In Progress";

  return "Not Started";
}

/** Fields on a task that Senior Management is allowed to edit inline. Status is deliberately excluded — it's computed, never written. */
export const EDITABLE_TASK_FIELDS = [
  "title",
  "owner_id",
  "due_date",
  "start_date",
  "description",
  "frequency",
  "indicator",
  "method_provider",
  "is_recurring",
  // Lets a task be moved to a different project after the fact (e.g. it
  // was mistakenly added under the wrong one) — see the "Project" selector
  // in TaskRow.tsx's edit form. task_type stays whatever it already was,
  // so a moved task still lands on the correct tab (Register vs
  // Monitoring) in its new project.
  "project_id",
  // Lets a task be moved between the Obligation Register and Monitoring
  // Schedule tabs — see the "Move to" selector in TaskRow.tsx's edit form.
  // PATCH /api/task-manager/tasks/[id] enforces the same invariants the
  // rest of the app relies on when this changes (monitoring tasks are
  // always recurring; indicator/method_provider are monitoring-only).
  "task_type",
] as const;

export type EditableTaskField = (typeof EDITABLE_TASK_FIELDS)[number];
