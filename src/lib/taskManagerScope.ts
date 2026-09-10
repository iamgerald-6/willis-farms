import type { SupabaseClient } from "@supabase/supabase-js";
import { canViewAllTasks } from "@/lib/taskAccessControl";
import {
  canBeAssignedAsSupervisorByRoleLabel,
  fetchUserRoleLabelMap,
  isSupervisoryRoleLabel,
} from "@/lib/userRoleAccessControl";

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

/**
 * Project visibility (GET /task-manager/projects) is decided by who
 * CREATED the project, not by the viewer's own scope — see
 * isProjectVisibleToViewer below. This resolves { creatorUserId -> role,
 * supervisorId } for a batch of project creators in two queries total
 * (not one per project).
 */
export type ProjectCreatorInfo = {
  role: string | null;
  supervisorId: string | null;
};

export async function fetchProjectCreatorInfo(
  supabase: SupabaseClient,
  creatorIds: readonly string[],
): Promise<Map<string, ProjectCreatorInfo>> {
  const map = new Map<string, ProjectCreatorInfo>();
  const ids = Array.from(new Set(creatorIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const [{ data: rows }, roleLabelMap] = await Promise.all([
    supabase.from("users").select("user_id, supervisor_id, user_role_id").in("user_id", ids),
    fetchUserRoleLabelMap(supabase),
  ]);

  for (const row of rows ?? []) {
    const userId = row.user_id as string;
    const roleId = row.user_role_id as string | null;
    map.set(userId, {
      role: roleId ? roleLabelMap.get(roleId) ?? null : null,
      supervisorId: (row.supervisor_id as string | null) ?? null,
    });
  }
  return map;
}

type ProjectVisibilityRow = {
  id: string;
  created_by: string;
};

/**
 * Whether a viewer can see a given project, per Sheila's rule (project
 * "ownership" is about who can SEE it, not a task-style owner_id field —
 * tm_projects has no such column):
 *   - Senior Management (or the tm_can_view_all_tasks grant, folded into
 *     `viewerCanSeeAll` by the caller via resolveTaskViewScope) sees every
 *     project.
 *   - The creator always sees their own project.
 *   - Anyone assigned a task inside the project can see it — this is
 *     already true whenever `taskVisibleProjectIds` (built from the
 *     existing per-task isTaskVisibleToViewer scope check) contains the
 *     project id, since owning a task always makes that project visible
 *     under "own"/"reports" scope. No separate assignee lookup needed.
 *   - Otherwise: if the creator is someone who CAN supervise others
 *     (Supervisory/Executive/HR/Super Admin), the project stays closed to
 *     everyone but the above. If the creator CANNOT supervise others
 *     (Standard Role, Consultant, System Administrator), the creator's own
 *     supervisor can also see it.
 */
export function isProjectVisibleToViewer(
  project: ProjectVisibilityRow,
  viewerId: string,
  viewerCanSeeAll: boolean,
  taskVisibleProjectIds: ReadonlySet<string>,
  creatorInfo: ProjectCreatorInfo | undefined,
): boolean {
  if (viewerCanSeeAll) return true;
  if (project.created_by === viewerId) return true;
  if (taskVisibleProjectIds.has(project.id)) return true;
  if (!creatorInfo) return false;
  if (canBeAssignedAsSupervisorByRoleLabel(creatorInfo.role)) return false;
  return !!creatorInfo.supervisorId && creatorInfo.supervisorId === viewerId;
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
