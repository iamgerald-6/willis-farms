import type { SupabaseClient } from "@supabase/supabase-js";
import { canViewAllTasks } from "@/lib/taskAccessControl";
import {
  canBeAssignedAsSupervisorByRoleLabel,
  fetchUserRoleLabelMap,
  isSupervisoryRoleLabel,
} from "@/lib/userRoleAccessControl";
import { assertSiteAccess } from "@/lib/siteAccess";
import type { ApiRequestUser } from "@/lib/apiRequestAuth";

/**
 * Site rule for Task Manager, layered ON TOP of the existing creator/
 * owner/reports-based visibility above, not instead of it (see
 * docs/SITE_ACCESS_ARCHITECTURE.md §6.3 item 7 follow-up — Task Manager was
 * originally left global/unscoped, later confirmed to need site-locking
 * too). A project untagged (site_id null — e.g. every project that existed
 * before this column did) stays visible to everyone, same "untagged = all
 * sites" convention used for Policies/SOPs. A caller always sees a project
 * they created themselves regardless of its site — same "own records"
 * exception used everywhere else this session — so a later site transfer
 * never hides someone's own past work from them.
 */
export function isProjectSiteVisible(
  user: ApiRequestUser,
  project: { site_id?: number | null; created_by?: string | null },
  hasOwnTaskInProject = false,
): boolean {
  if (project.created_by === user.id) return true;
  // A caller who owns/created at least one task inside this project always
  // sees the project itself, regardless of site — otherwise a headquarters
  // caller assigning a task to someone at a different site would create a
  // task that person owns (and isTaskSiteVisible would show them) but can
  // never reach, because the project it lives under gets filtered out
  // first. Same "own records" exception used at the task level, applied
  // one level up so it can't be short-circuited by the project list.
  if (hasOwnTaskInProject) return true;
  if (project.site_id == null) return true;
  return assertSiteAccess(user, project.site_id);
}

/**
 * Same site rule as isProjectSiteVisible, applied to a task via its parent
 * project's site_id (tasks don't carry their own site_id — see
 * docs/multi-site/add-site-id-tm-projects.sql). A caller assigned to or who
 * created the task itself always sees it regardless of site, same "own
 * records" exception.
 */
export function isTaskSiteVisible(
  user: ApiRequestUser,
  task: { owner_id?: string | null; created_by?: string | null },
  projectSiteId: number | null,
): boolean {
  if (task.owner_id === user.id || task.created_by === user.id) return true;
  if (projectSiteId == null) return true;
  return assertSiteAccess(user, projectSiteId);
}

/**
 * Convenience for the single-task action routes (archive/complete/delete/
 * restore/progress/audit/subtasks) — looks up the task's parent project's
 * site_id and applies isTaskSiteVisible in one call, so each route doesn't
 * repeat the join.
 */
export async function assertTaskSiteAccess(
  supabase: SupabaseClient,
  user: ApiRequestUser,
  task: { project_id: string; owner_id?: string | null; created_by?: string | null },
): Promise<boolean> {
  if (task.owner_id === user.id || task.created_by === user.id) return true;
  const { data: project } = await supabase
    .from("tm_projects")
    .select("site_id")
    .eq("id", task.project_id)
    .maybeSingle();
  return isTaskSiteVisible(user, task, project?.site_id ?? null);
}

/**
 * Whether `user` (the caller creating/editing a task) may assign it to
 * `ownerId`. Headquarters callers (ALL_SITES) may assign to anyone,
 * anywhere — everyone else may only assign tasks to someone at their own
 * site, including themselves. Mirrors assertSiteAccess's null-handling: an
 * owner with no site of their own can't be assigned to by a non-
 * headquarters caller (a missing site isn't "safe to assume is mine",
 * same rule used everywhere else this session).
 */
export async function assertOwnerSiteAssignable(
  supabase: SupabaseClient,
  user: ApiRequestUser,
  ownerId: string | null | undefined,
): Promise<boolean> {
  if (!ownerId || ownerId === user.id) return true;
  const { data: owner } = await supabase
    .from("users")
    .select("site_id")
    .eq("user_id", ownerId)
    .maybeSingle();
  return assertSiteAccess(user, owner?.site_id ?? null);
}

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
