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

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function GanttView({ project }: { project: TMProject }) {
  const { data, isLoading } = useQuery<{ tasks: TMTask[] }>({
    // Completed tasks stay on the board (at 100%) until the project itself
    // is closed — Sheila wants managers to be able to see what's finished,
    // not just what's outstanding.
    queryKey: ["tm-tasks", project.id, "active,completed"],
    queryFn: async () => (await api.get(`/task-manager/tasks?project_id=${project.id}&include=active,completed`)).data,
  });

  // Sorted by due date (undated tasks last) rather than by progress — this
  // is a timeline view, so ordering should stay put as a task's progress
  // changes. Sorting by progress meant a recurring task cycling back to 0%
  // jumped straight to one end of the list, which looked like it had
  // vanished rather than just moved.
  const tasks = [...(data?.tasks ?? [])].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  if (isLoading) return <GanttBarsSkeleton />;

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No tasks yet.</p>}
        <div className="space-y-3">
          {tasks.map((t) => {
            const pct = t.progress_percent ?? 0;
            const status = t.display_status ?? "Not Started";
            const startLabel = t.start_date ? fmtShort(t.start_date) : null;
            const dueLabel = t.due_date ? fmtShort(t.due_date) : null;
            return (
              <div key={t.id} className="flex flex-col sm:grid sm:grid-cols-[1fr_1fr_2fr_auto] gap-2 sm:gap-4 sm:items-center py-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {t.title}
                    {t.is_recurring && (
                      <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 align-middle">
                        Recurring
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{t.owner_name ?? "Unassigned"}</p>
                </div>
                <div className="text-xs text-gray-500 whitespace-nowrap">
                  {startLabel && <span>{startLabel}</span>}
                  {startLabel && dueLabel && <span className="text-gray-300 mx-1">→</span>}
                  {dueLabel && <span>{dueLabel}</span>}
                  {!startLabel && !dueLabel && <span className="text-gray-300">No dates set</span>}
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
