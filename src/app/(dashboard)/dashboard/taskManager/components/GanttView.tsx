"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { TMProject, TMTask, DisplayStatus } from "@/types/taskManager";
import { GanttBarsSkeleton } from "@/components/skeletons/PageSkeletons";

// Bar fill colors keyed to the same status set used everywhere else in
// Task Manager (see statusStyles.ts) — kept separate because a solid bar
// fill needs a stronger color than the pale badge backgrounds there.
const BAR_COLOR: Record<DisplayStatus, string> = {
  "Not Started": "bg-gray-300",
  "In Progress": "bg-amber-500",
  Overdue: "bg-red-500",
  "Compliant / Ongoing": "bg-green-500",
  Completed: "bg-blue-500",
  Archived: "bg-gray-300",
  Deleted: "bg-gray-300",
};

export default function GanttView({ project }: { project: TMProject }) {
  const { data, isLoading } = useQuery<{ tasks: TMTask[] }>({
    // Completed tasks stay on the board (at 100%) until the project itself
    // is closed — Sheila wants managers to be able to see what's finished,
    // not just what's outstanding.
    queryKey: ["tm-tasks", project.id, "active,completed"],
    queryFn: async () => (await api.get(`/task-manager/tasks?project_id=${project.id}&include=active,completed`)).data,
  });

  const tasks = [...(data?.tasks ?? [])].sort((a, b) => (a.progress_percent ?? 0) - (b.progress_percent ?? 0));

  if (isLoading) return <GanttBarsSkeleton />;

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-900 mb-1">{project.name} — Dashboard / Gantt</h3>
      <p className="text-xs text-gray-400 mb-4">At a glance: how complete each task is, not when it's due.</p>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No tasks yet.</p>}
        <div className="space-y-3">
          {tasks.map((t) => {
            const pct = t.progress_percent ?? 0;
            const status = t.display_status ?? "Not Started";
            return (
              <div key={t.id} className="flex flex-col sm:grid sm:grid-cols-[1fr_2fr_auto] gap-2 sm:gap-4 sm:items-center py-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                  <p className="text-xs text-gray-400 truncate">{t.owner_name ?? "Unassigned"}</p>
                </div>
                <div className="h-3 rounded-full bg-gray-100 overflow-hidden w-full">
                  <div className={`h-full rounded-full ${BAR_COLOR[status]}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center gap-2 sm:justify-end sm:w-24">
                  <span className="text-xs font-semibold text-gray-700 tabular-nums">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
