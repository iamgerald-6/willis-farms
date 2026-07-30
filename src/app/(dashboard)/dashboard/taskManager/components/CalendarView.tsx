"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { TMProject, TMTask } from "@/types/taskManager";
import { STATUS_STYLES } from "../statusStyles";

export default function CalendarView({ project }: { project: TMProject }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const { data } = useQuery<{ tasks: TMTask[] }>({
    queryKey: ["tm-tasks", project.id, "active"],
    queryFn: async () => (await api.get(`/task-manager/tasks?project_id=${project.id}&include=active`)).data,
  });

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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">
          {project.name} — Compliance Calendar
        </h3>
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
                        const style = STATUS_STYLES[t.display_status ?? "Not Started"];
                        return (
                          <p key={t.id} title={t.title} className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${style.bg} ${style.text}`}>
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
