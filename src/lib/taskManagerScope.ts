import type { SupabaseClient } from "@supabase/supabase-js";
import { canViewAllTasks } from "@/lib/taskAccessControl";
import { isSupervisoryRoleLabel } from "@/lib/userRoleAccessControl";

/** Who can see which tasks in Task Manager list/project views. */
export type TaskViewScope = "all" | "reports" | "own";

/**
 * - all: Executive Role, Human Resource, Super Admin (+ optional grant)
 * - reports: Supervisory Role — own tasks + direct reports' tasks
 * - own: everyone else — own assigned tasks + tasks they created for others
 */
export function resolveTaskViewScope(
  role: string | null | undefined,
  tmCanViewAllTasks: boolean | null | undefined,
): TaskViewScope {
  if (canViewAllTasks(role, tmCanViewAllTasks)) return "all";
  if (isSupervisoryRoleLabel(role)) return "reports";
  return "own";
}

export async function fetchDirectReportUserIds(
  supabase: SupabaseClient,
  supervisorUserId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("users")
    .select("user_id")
    .eq("supervisor_id", supervisorUserId);
  return (data ?? [])
    .map((row) => row.user_id as string)
    .filter(Boolean);
}

type TaskVisibilityRow = {
  owner_id?: string | null;
  created_by?: string | null;
};

export function isTaskVisibleToViewer(
  task: TaskVisibilityRow,
  viewerId: string,
  scope: TaskViewScope,
  directReportIds: readonly string[],
): boolean {
  if (scope === "all") return true;

  const ownerId = task.owner_id ?? null;
  const createdBy = task.created_by ?? null;

  if (scope === "reports") {
    if (ownerId === viewerId) return true;
    return !!ownerId && directReportIds.includes(ownerId);
  }

  if (ownerId === viewerId) return true;
  return createdBy === viewerId;
}

/** Apply read-scope filters to a tm_tasks list query (PostgREST builder). */
export async function applyTaskListVisibilityFilter<
  T extends {
    in: (column: string, values: string[]) => T;
    or: (filters: string) => T;
  },
>(
  query: T,
  supabase: SupabaseClient,
  viewerId: string,
  scope: TaskViewScope,
): Promise<T> {
  if (scope === "all") return query;

  if (scope === "reports") {
    const directReportIds = await fetchDirectReportUserIds(supabase, viewerId);
    const ownerIds = [viewerId, ...directReportIds];
    return query.in("owner_id", ownerIds);
  }

  return query.or(`owner_id.eq.${viewerId},created_by.eq.${viewerId}`);
}
