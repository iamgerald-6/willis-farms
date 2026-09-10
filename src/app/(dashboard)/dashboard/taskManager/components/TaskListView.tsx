"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, Plus, FileUp } from "lucide-react";
import api from "@/lib/api";
import { TMProject, TMTask, DisplayStatus } from "@/types/taskManager";
import { User } from "@/types";
import TaskRow from "./TaskRow";
import NewTaskRow from "./NewTaskRow";
import AuditLogDrawer from "./AuditLogDrawer";
import DocumentExtractionModal from "./DocumentExtractionModal";
import { TableSkeleton } from "@/components/skeletons/PageSkeletons";
import { TASK_TABLE_GRID_COLS } from "@/lib/taskManagerConstants";

export type LifecycleViewKey = "all" | "overdue" | "not_started" | "in_progress" | "ongoing" | "completed" | "archived" | "deleted";

// Filters by the same computed display_status shown everywhere else in
// Task Manager (the badge on each row, the Summary page's buckets) rather
// than raw lifecycle_status — "Active" used to mean "not archived/deleted",
// which lumped Overdue, In Progress, Not Started, and Compliant/Ongoing
// tasks together with no way to narrow further. Everyone can use these
// tabs now (not just Senior Management, per Sheila) — only Archived and
// Deleted stay manager-only, since those are the two that expose removed
// work rather than just narrowing what's currently open.
//
// Tabs sharing the same serverInclude fetch from ONE shared query and
// narrow client-side (see `tasks` below) — All/Overdue/Not Started/In
// Progress/Ongoing/Completed all read from the same active+completed
// fetch, so switching between them is instant, no extra request.
const LIFECYCLE_VIEWS: {
  key: LifecycleViewKey;
  label: string;
  serverInclude: string;
  statusFilter: DisplayStatus | null;
  managerOnly?: boolean;
}[] = [
  { key: "all", label: "All", serverInclude: "active,completed", statusFilter: null },
  { key: "overdue", label: "Overdue", serverInclude: "active,completed", statusFilter: "Overdue" },
  { key: "not_started", label: "Not Started", serverInclude: "active,completed", statusFilter: "Not Started" },
  { key: "in_progress", label: "In Progress", serverInclude: "active,completed", statusFilter: "In Progress" },
  { key: "ongoing", label: "Ongoing / Compliant", serverInclude: "active,completed", statusFilter: "Compliant / Ongoing" },
  { key: "completed", label: "Completed", serverInclude: "active,completed", statusFilter: "Completed" },
  { key: "archived", label: "Archived", serverInclude: "archived", statusFilter: null, managerOnly: true },
  { key: "deleted", label: "Deleted", serverInclude: "deleted", statusFilter: null, managerOnly: true },
];

type Variant = "register" | "monitoring";

export default function TaskListView({
  project,
  projects,
  users,
  isSeniorManagement,
  currentUserId,
  variant = "register",
  initialFilter,
}: {
  project: TMProject;
  // Every active project — threaded down to TaskRow's "Project" move
  // selector. Optional so nothing breaks if a caller doesn't pass it.
  projects?: TMProject[];
  users: User[];
  isSeniorManagement: boolean;
  currentUserId: string | null;
  variant?: Variant;
  // Which filter tab to open on, e.g. when arriving here from a Summary
  // page stat card ("2 overdue" -> lands straight on the Overdue tab
  // instead of All). Only read once, on mount — the caller is expected to
  // force a remount (change this component's `key`) if it needs to jump to
  // a different filter while already on this tab; see tasks/page.tsx.
  initialFilter?: LifecycleViewKey;
}) {
  const [editMode, setEditMode] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [lifecycleView, setLifecycleView] = useState<LifecycleViewKey>(initialFilter ?? "all");
  const [auditTask, setAuditTask] = useState<TMTask | null>(null);
  const [extractOpen, setExtractOpen] = useState(false);
  const queryClient = useQueryClient();

  const activeView = LIFECYCLE_VIEWS.find((v) => v.key === lifecycleView) ?? LIFECYCLE_VIEWS[0];
  const queryKey = ["tm-tasks", project.id, activeView.serverInclude];
  const { data, isLoading } = useQuery<{ tasks: TMTask[] }>({
    queryKey,
    queryFn: async () => (await api.get(`/task-manager/tasks?project_id=${project.id}&include=${activeView.serverInclude}`)).data,
  });

  const refresh = () => {
    // Broad on purpose (no project id) — moving a task to a different
    // project needs that OTHER project's cached task list invalidated too,
    // not just this one's, or it'll show stale data (missing the moved-in
    // task, or still showing the moved-out one) whenever the user switches
    // to it next.
    queryClient.invalidateQueries({ queryKey: ["tm-tasks"] });
    // The project pills show a live "N overdue" count from a separate
    // query — without this it goes stale after any edit (e.g. changing a
    // due date) since the pills never remount on their own.
    queryClient.invalidateQueries({ queryKey: ["tm-projects"] });
  };

  const allTasks = data?.tasks ?? [];
  const tasks = allTasks
    .filter((t) => (variant === "monitoring" ? t.task_type === "monitoring" : t.task_type !== "monitoring"))
    .filter((t) => !activeView.statusFilter || (t.display_status ?? "Not Started") === activeView.statusFilter);

  // Who a given viewer can actually assign a task to — mirrors the POST
  // /task-manager/tasks check: Senior Management can assign anyone; anyone
  // else can only assign themselves or someone who has them recorded as
  // supervisor_id (not gated on a "Supervisory Role" label — see
  // src/app/api/task-manager/tasks/route.ts). Used for both creating a new
  // task and reassigning an existing one's owner while editing.
  const assignableUsers = useMemo(() => {
    if (isSeniorManagement) return users;
    return users.filter((u) => u.user_id === currentUserId || u.supervisor_id === currentUserId);
  }, [users, isSeniorManagement, currentUserId]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            {LIFECYCLE_VIEWS.filter((v) => !v.managerOnly || isSeniorManagement).map((v) => (
              <button
                key={v.key}
                onClick={() => setLifecycleView(v.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  lifecycleView === v.key ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* "Edit List" + "Add Task" are available to everyone now, not just
            Senior Management (per Sheila) — what the toggle actually reveals
            for a given viewer still differs: Senior Management gets the full
            toolkit (add, edit any task, archive, delete), everyone else only
            gets a pencil-edit icon on tasks they personally created (see
            TaskRow's per-row gating) plus this shared "Add Task" entry
            point. "From Document" (bulk AI extraction) stays Senior
            Management only — it's a heavier admin import tool, not asked
            for here. */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {editMode && lifecycleView === "all" && (
            <>
              {variant === "register" && isSeniorManagement && (
                <button
                  onClick={() => setExtractOpen(true)}
                  className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gray-50"
                >
                  <FileUp className="w-3.5 h-3.5" /> From Document
                </button>
              )}
              <button
                onClick={() => setAddingTask(true)}
                className="flex items-center gap-1.5 border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gray-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add Task
              </button>
            </>
          )}
          <button
            onClick={() => {
              setEditMode((v) => !v);
              setAddingTask(false);
            }}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition ${
              editMode ? "bg-red-600 text-white hover:bg-red-700" : "border-2 border-red-600 text-red-600 hover:bg-red-50"
            }`}
          >
            {editMode ? (
              <>
                <Check className="w-3.5 h-3.5" /> Done Editing
              </>
            ) : (
              <>
                <Pencil className="w-3.5 h-3.5" /> Edit List
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Desktop table header */}
        <div className={`hidden md:grid ${TASK_TABLE_GRID_COLS} gap-3 px-3 py-2 border-b border-gray-100 bg-gray-50/60`}>
          <div />
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{variant === "monitoring" ? "Indicator" : "Task"}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Owner</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Start Date</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{variant === "monitoring" ? "Next Due" : "Due Date"}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</p>
          <div />
        </div>

        <div className="px-1 py-1">
          {isLoading && (
            <div className="px-1 py-2">
              <TableSkeleton rows={4} cols={5} />
            </div>
          )}
          {!isLoading && tasks.length === 0 && !addingTask && (
            <p className="text-sm text-gray-400 px-3 py-8 text-center">No tasks here yet.</p>
          )}
          {addingTask && (
            <div className="px-1 py-1">
              <NewTaskRow
                projectId={project.id}
                users={assignableUsers}
                variant={variant}
                onCancel={() => setAddingTask(false)}
                onCreated={() => {
                  setAddingTask(false);
                  refresh();
                }}
              />
            </div>
          )}
          {tasks.map((task) => {
            // Always include this task's current owner in its own
            // OwnerSelect options, even if they've since fallen outside the
            // viewer's assignable set (e.g. no longer a direct report) —
            // otherwise the edit form would show no matching selection for
            // the task's actual current owner.
            const rowUsers =
              isSeniorManagement || assignableUsers.some((u) => u.user_id === task.owner_id)
                ? assignableUsers
                : [...assignableUsers, ...users.filter((u) => u.user_id === task.owner_id)];
            return (
              <TaskRow
                key={task.id}
                task={task}
                editMode={editMode}
                users={rowUsers}
                projects={projects}
                currentUserId={currentUserId}
                isSeniorManagement={isSeniorManagement}
                variant={variant}
                onChanged={refresh}
                onOpenAudit={setAuditTask}
              />
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-400 italic mt-3">
        {isSeniorManagement
          ? "You can edit, archive, or delete any task. Every change is logged with who made it and when — tap the clock icon on any task to see its history."
          : "You can create tasks, edit tasks you created, and update progress on tasks assigned to you. Archiving and deleting are Senior Management only. Every change is logged — tap the clock icon on any task to see its history."}
      </p>

      {auditTask && <AuditLogDrawer task={auditTask} onClose={() => setAuditTask(null)} />}
      {extractOpen && (
        <DocumentExtractionModal
          project={project}
          users={users}
          onClose={() => setExtractOpen(false)}
          onSaved={() => {
            setExtractOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
