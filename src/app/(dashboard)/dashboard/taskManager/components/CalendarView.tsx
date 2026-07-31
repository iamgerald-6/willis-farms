"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { TMProject, TMTask } from "@/types/taskManager";

// Cycled by project so every project gets a consistent dot/chip color
// across the whole calendar, however many projects there are.
const PROJECT_COLORS = [
  { dot: "bg-red-500", chipBg: "bg-red-50", chipText: "text-red-700" },
  { dot: "bg-blue-500", chipBg: "bg-blue-50", chipText: "text-blue-700" },
  { dot: "bg-green-500", chipBg: "bg-green-50", chipText: "text-green-700" },
  { dot: "bg-amber-500", chipBg: "bg-amber-50", chipText: "text-amber-700" },
  { dot: "bg-purple-500", chipBg: "bg-purple-50", chipText: "text-purple-700" },
  { dot: "bg-teal-500", chipBg: "bg-teal-50", chipText: "text-teal-700" },
];

export default function CalendarView({ projects }: { projects: TMProject[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  // No project_id — this deliberately spans every project the user can see.
  const { data } = useQuery<{ tasks: TMTask[] }>({
    queryKey: ["tm-tasks", "all-projects", "active"],
    queryFn: async () => (await api.get(`/task-manager/tasks?include=active`)).data,
  });

  const activeProjects = projects.filter((p) => p.status === "active");
  const colorByProject = useMemo(() => {
    const map: Record<string, (typeof PROJECT_COLORS)[number]> = {};
    activeProjects.forEach((p, i) => {
      map[p.id] = PROJECT_COLORS[i % PROJECT_COLORS.length];
    });
    return map;
  }, [activeProjects]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, TMTask[]> = {};
    for (const t of data?.tasks ?? []) {
      if (!t.due_date) continue;
      const key = t.due_date.slice(0, 10);
      (map[key] ??= []).push(t);
    }
    return map;
  }, [data]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (day: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900">Compliance Calendar — All Projects</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-semibold text-gray-700 w-32 text-center">
            {firstDay.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </p>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {activeProjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4">
          {activeProjects.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${colorByProject[p.id]?.dot ?? "bg-gray-400"}`} />
              <span className="text-xs text-gray-600">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/60">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <p key={d} className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-center py-2">
              {d}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const key = day ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : `blank-${i}`;
            const dayTasks = day ? (tasksByDay[key] ?? []) : [];
            return (
              <div key={key} className={`min-h-[92px] border-b border-r border-gray-50 p-1.5 ${day ? "" : "bg-gray-50/30"}`}>
                {day && (
                  <>
                    <span
                      className={`text-xs font-semibold inline-flex items-center justify-center w-5 h-5 rounded-full ${
                        isToday(day) ? "bg-red-600 text-white" : "text-gray-500"
                      }`}
                    >
                      {day}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayTasks.slice(0, 2).map((t) => {
                        const color = colorByProject[t.project_id] ?? { chipBg: "bg-gray-100", chipText: "text-gray-600" };
                        return (
                          <p
                            key={t.id}
                            title={`${t.title} — ${t.project_name ?? ""}`}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${color.chipBg} ${color.chipText}`}
                          >
                            {t.title}
                          </p>
                        );
                      })}
                      {dayTasks.length > 2 && <p className="text-[10px] text-gray-400 px-1.5">+{dayTasks.length - 2} more</p>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
