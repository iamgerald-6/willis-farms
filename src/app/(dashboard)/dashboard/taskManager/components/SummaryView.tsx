"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { TMProject, TMTask, DisplayStatus } from "@/types/taskManager";
import { STATUS_STYLES } from "../statusStyles";
import { SummaryCardsSkeleton } from "@/components/skeletons/PageSkeletons";

// "Completed" is deliberately included here now — a finished task is still
// part of the project's story, and hiding it entirely (the old behavior,
// back when this only fetched include=active) made it look like completed
// work just vanished from the summary.
const STATUS_ORDER: DisplayStatus[] = ["Overdue", "In Progress", "Not Started", "Compliant / Ongoing", "Completed"];

export default function SummaryView({ project }: { project: TMProject }) {
  const { data, isLoading } = useQuery<{ tasks: TMTask[] }>({
    // Same key/scope TaskListView and GanttView use by default — completed
    // tasks stay visible here (see STATUS_ORDER above), not just active ones.
    queryKey: ["tm-tasks", project.id, "active,completed"],
    queryFn: async () => (await api.get(`/task-manager/tasks?project_id=${project.id}&include=active,completed`)).data,
  });

  const tasks = data?.tasks ?? [];
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    const s = t.display_status ?? "Not Started";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  const upcoming = [...tasks]
    .filter((t) => t.due_date && t.display_status !== "Completed")
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5);

  if (isLoading) return <SummaryCardsSkeleton />;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-gray-900">{tasks.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total tasks</p>
        </div>
        {STATUS_ORDER.map((s) => (
          <div key={s} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className={`text-2xl font-bold ${STATUS_STYLES[s].text}`}>{counts[s] ?? 0}</p>
            <p className="text-xs text-gray-500 mt-1">{s}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Coming up</p>
        {upcoming.length === 0 && <p className="text-sm text-gray-400">Nothing scheduled.</p>}
        <div className="space-y-2.5">
          {upcoming.map((t) => {
            const style = STATUS_STYLES[t.display_status ?? "Not Started"];
            return (
              <div key={t.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm py-1">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800">{t.title}</p>
                  <p className="text-xs text-gray-400">{t.owner_name ?? "Unassigned"}</p>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span className="text-xs text-gray-500">
                    {new Date(t.due_date!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                    {t.display_status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
