"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, Plus, FileUp } from "lucide-react";
import api from "@/lib/api";
import { TMProject, TMTask } from "@/types/taskManager";
import { User } from "@/types";
import TaskRow from "./TaskRow";
import NewTaskRow from "./NewTaskRow";
import AuditLogDrawer from "./AuditLogDrawer";
import DocumentExtractionModal from "./DocumentExtractionModal";
import { TableSkeleton } from "@/components/skeletons/PageSkeletons";

// "Active" deliberately includes completed tasks too — Sheila wants
// finished work to stay visible on the dashboard (so a manager can see
// what's been completed at a glance) rather than disappearing the moment
// it's marked done. It only drops off once the task itself is archived,
// or the whole project is closed. "Completed" still exists as its own
// filter for anyone who wants to see only what's finished.
const LIFECYCLE_VIEWS: { key: string; label: string }[] = [
  { key: "active,completed", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
  { key: "deleted", label: "Deleted" },
];

type Variant = "register" | "monitoring";

export default function TaskListView({
  project,
  projects,
  users,
  isSeniorManagement,
  currentUserId,
  variant = "register",
}: {
  project: TMProject;
  // Every active project — threaded down to TaskRow's "Project" move
  // selector. Optional so nothing breaks if a caller doesn't pass it.
  projects?: TMProject[];
  users: User[];
  isSeniorManagement: boolean;
  currentUserId: string | null;
  variant?: Variant;
}) {
  const [editMode, setEditMode] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [lifecycleView, setLifecycleView] = useState("active,completed");
  const [auditTask, setAuditTask] = useState<TMTask | null>(null);
  const [extractOpen, setExtractOpen] = useState(false);
  const queryClient = useQueryClient();

  const queryKey = ["tm-tasks", project.id, lifecycleView];
  const { data, isLoading } = useQuery<{ tasks: TMTask[] }>({
    queryKey,
    queryFn: async () => (await api.get(`/task-manager/tasks?project_id=${project.id}&include=${lifecycleView}`)).data,
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
  const tasks = allTasks.filter((t) => (variant === "monitoring" ? t.task_type === "monitoring" : t.task_type !== "monitoring"));
  const title = variant === "monitoring" ? "Monitoring Schedule" : "Obligation Register";
  const description =
    variant === "monitoring"
      ? "Recurring monitoring and testing requirements, and when each one is next due."
      : "Every one-off obligation and deadline tracked for this project — permits, renewals, reports and the like.";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900 break-words">{project.name} — {title}</h3>
          <p className="text-xs text-gray-400 mt-1">{description}</p>
          {isSeniorManagement && (
            <div className="flex flex-wrap items-center gap-1 mt-2">
              {LIFECYCLE_VIEWS.map((v) => (
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
          )}
        </div>

        {isSeniorManagement && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {editMode && lifecycleView === "active,completed" && (
              <>
                {variant === "register" && (
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
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Desktop table header */}
        <div className="hidden md:grid grid-cols-[2.5rem_1fr_1fr_1fr_1fr_auto] gap-3 px-3 py-2 border-b border-gray-100 bg-gray-50/60">
          <div />
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{variant === "monitoring" ? "Indicator" : "Task"}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Owner</p>
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
                users={users}
                variant={variant}
                onCancel={() => setAddingTask(false)}
                onCreated={() => {
                  setAddingTask(false);
                  refresh();
                }}
              />
            </div>
          )}
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              editMode={editMode}
              users={users}
              projects={projects}
              currentUserId={currentUserId}
              isSeniorManagement={isSeniorManagement}
              variant={variant}
              onChanged={refresh}
              onOpenAudit={setAuditTask}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 italic mt-3">
        {isSeniorManagement
          ? "Only Senior Management can edit, archive, or delete tasks. Every change is logged with who made it and when — tap the clock icon on any task to see its history."
          : "You can update the progress on your own tasks — everything else here is read-only."}
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
