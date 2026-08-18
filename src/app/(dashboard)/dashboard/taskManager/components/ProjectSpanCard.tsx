"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { TMProject, TMTask } from "@/types/taskManager";

function fmtSpanDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Shown on the Task Manager page itself — below the project search box,
 * above the Summary/Gantt/Register/Monitoring tabs — so the project's
 * overall timeline is visible no matter which tab is open, not just on the
 * Summary tab. Shares the same ["tm-tasks", project.id, "active,completed"]
 * query SummaryView/GanttView/TaskListView already use, so switching to one
 * of those tabs right after doesn't trigger a second fetch.
 */
export default function ProjectSpanCard({ project }: { project: TMProject }) {
  const { data } = useQuery<{ tasks: TMTask[] }>({
    queryKey: ["tm-tasks", project.id, "active,completed"],
    queryFn: async () => (await api.get(`/task-manager/tasks?project_id=${project.id}&include=active,completed`)).data,
  });

  const tasks = data?.tasks ?? [];
  const startDates = tasks.map((t) => t.start_date).filter((d): d is string => !!d);
  const dueDates = tasks.map((t) => t.due_date).filter((d): d is string => !!d);
  const earliestStart = startDates.length > 0 ? startDates.reduce((min, d) => (d < min ? d : min)) : null;
  const latestDue = dueDates.length > 0 ? dueDates.reduce((max, d) => (d > max ? d : max)) : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mt-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Project span</p>
      {earliestStart || latestDue ? (
        <p className="text-lg font-semibold text-gray-800">
          {earliestStart ? fmtSpanDate(earliestStart) : "No start date set"}
          <span className="text-gray-300 mx-2">→</span>
          {latestDue ? fmtSpanDate(latestDue) : "No due date set"}
        </p>
      ) : (
        <p className="text-sm text-gray-400">No start or due dates set on any task yet.</p>
      )}
      <p className="text-xs text-gray-400 mt-1">Earliest task start date to the latest task due date, across every active and completed task.</p>
    </div>
  );
}
