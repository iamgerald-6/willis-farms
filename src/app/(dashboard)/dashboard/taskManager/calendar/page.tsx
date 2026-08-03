"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, Users, CalendarDays, ListChecks } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { TMTask } from "@/types/taskManager";
import { STATUS_STYLES } from "../statusStyles";

// A company-wide calendar — same event types Human Capital's Schedule
// Planner shows (recurring off days, leave, appraisal review dates), plus
// task due dates from Task Manager, all on one read-only grid. Deliberately
// NOT a replacement for Schedule Planner: the off-day picker and the "my
// leave applications" list are self-service tools that stay there — this
// page is purely for seeing everything at a glance across the company.

// ─── Types ──────────────────────────────────────────────────────────────
interface Leave {
  id: string;
  user_id: string;
  leave_type: string;
  reason: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: "pending" | "approved" | "rejected";
}

interface OffDay {
  id: string;
  user_id: string;
  day_of_week: number; // 0=Sun … 6=Sat
  effective_from: string; // "YYYY-MM-DD"
}

interface AppraisalDate {
  id: string;
  company_id: string;
  employee_name: string;
  final_review_date: string;
}

interface DayEvent {
  type: "off" | "leave" | "appraisal" | "task";
  label: string;
  color: string;
  userName?: string;
  status?: string;
  // task-only extras, used by the day detail panel
  task?: TMTask;
}

// ─── Constants ──────────────────────────────────────────────────────────
const DAY_NAMES_MIN = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const BRAND = "#C62828";
const BRAND_LIGHT = "#FFEBEE";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

// Cycled by project so every project gets a consistent chip color across
// the whole calendar, however many projects there are — same palette the
// old task-only calendar used.
const TASK_CHIP_COLORS = [
  "bg-red-50 text-red-700",
  "bg-blue-50 text-blue-700",
  "bg-green-50 text-green-700",
  "bg-amber-50 text-amber-700",
  "bg-purple-50 text-purple-700",
  "bg-teal-50 text-teal-700",
];

// ─── Helpers ────────────────────────────────────────────────────────────
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Returns the active day_of_week for a user on a specific date. userRows must be sorted by effective_from DESC. */
function getActiveOffDay(userRows: OffDay[], date: string): number | null {
  const active = userRows.find((r) => r.effective_from <= date);
  return active?.day_of_week ?? null;
}

// ─── Week View ──────────────────────────────────────────────────────────
function WeekView({ weekDates, events, today }: { weekDates: Date[]; events: Map<string, DayEvent[]>; today: string }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAY_NAMES.map((d, idx) => (
        <div key={d} className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider py-2">
          <span className="hidden sm:inline">{d}</span>
          <span className="inline sm:hidden">{DAY_NAMES_MIN[idx]}</span>
        </div>
      ))}
      {weekDates.map((date) => {
        const ds = date.toISOString().split("T")[0];
        const dayEvents = events.get(ds) ?? [];
        const isToday = ds === today;
        return (
          <div
            key={ds}
            className="min-h-[100px] sm:min-h-[120px] rounded-xl border p-1.5 sm:p-2 flex flex-col justify-between"
            style={isToday ? { borderColor: BRAND, background: "#FFF5F5" } : { borderColor: "#f3f4f6", background: "#fff" }}
          >
            <p className="text-xs sm:text-sm font-bold mb-1" style={isToday ? { color: BRAND } : { color: "#374151" }}>
              {date.getDate()}
            </p>
            <div className="space-y-1 flex-1 overflow-y-auto max-h-[70px] no-scrollbar">
              {dayEvents.map((ev, i) => (
                <div key={i} className={`text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded-md font-medium truncate ${ev.color}`}>
                  {ev.label}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Month View ─────────────────────────────────────────────────────────
function MonthView({
  year,
  month,
  events,
  today,
  onDayClick,
}: {
  year: number;
  month: number;
  events: Map<string, DayEvent[]>;
  today: string;
  onDayClick: (ds: string, evs: DayEvent[]) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="grid grid-cols-7 gap-1">
      {DAY_NAMES.map((d, idx) => (
        <div key={d} className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider py-2">
          <span className="hidden sm:inline">{d}</span>
          <span className="inline sm:hidden">{DAY_NAMES_MIN[idx]}</span>
        </div>
      ))}
      {cells.map((day, i) => {
        if (!day) return <div key={i} className="min-h-[60px] sm:min-h-[80px]" />;
        const ds = dateStr(year, month, day);
        const dayEvents = events.get(ds) ?? [];
        const isToday = ds === today;
        return (
          <button
            key={i}
            onClick={() => onDayClick(ds, dayEvents)}
            className="min-h-[60px] sm:min-h-[80px] rounded-xl border p-1 sm:p-2 text-left transition-all hover:shadow-sm flex flex-col justify-between"
            style={isToday ? { borderColor: BRAND, background: "#FFF5F5" } : { borderColor: "#f3f4f6", background: "#fff" }}
          >
            <p className="text-xs sm:text-sm font-bold mb-1" style={isToday ? { color: BRAND } : { color: "#374151" }}>
              {day}
            </p>
            <div className="w-full space-y-0.5 overflow-hidden">
              <div className="hidden sm:block space-y-0.5">
                {dayEvents.slice(0, 2).map((ev, j) => (
                  <div key={j} className={`text-[10px] px-1 py-0.5 rounded font-medium truncate ${ev.color}`}>
                    {ev.label}
                  </div>
                ))}
                {dayEvents.length > 2 && <p className="text-[9px] text-gray-400">+{dayEvents.length - 2} more</p>}
              </div>
              <div className="flex sm:hidden flex-wrap gap-0.5 max-h-[16px] overflow-hidden">
                {dayEvents.map((ev, j) => (
                  <span
                    key={j}
                    className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${
                      ev.type === "off"
                        ? "bg-gray-400"
                        : ev.type === "appraisal"
                          ? "bg-blue-500"
                          : ev.type === "task"
                            ? "bg-red-400"
                            : ev.status === "approved"
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                    }`}
                  />
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Day Detail Panel ───────────────────────────────────────────────────
function DayDetailPanel({ date, events, onClose }: { date: string; events: DayEvent[]; onClose: () => void }) {
  const d = new Date(date + "T00:00:00");
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl border border-gray-200 p-6 w-full max-w-md shadow-xl max-h-[85vh] overflow-y-auto transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{DAY_NAMES_FULL[d.getDay()]}</p>
            <h3 className="text-lg font-bold text-gray-900">
              {d.getDate()} {MONTH_NAMES[d.getMonth()]} {d.getFullYear()}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold p-1 leading-none">
            ×
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No events on this day</p>
        ) : (
          <div className="space-y-3">
            {events.map((ev, i) =>
              ev.type === "task" && ev.task ? (
                <div key={i} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900">{ev.task.title}</p>
                    <span
                      className={`flex-shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        STATUS_STYLES[ev.task.display_status ?? "Not Started"].bg
                      } ${STATUS_STYLES[ev.task.display_status ?? "Not Started"].text} ${STATUS_STYLES[ev.task.display_status ?? "Not Started"].border}`}
                    >
                      {ev.task.display_status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">{ev.task.project_name ?? "—"}</p>
                  <p className="text-xs text-gray-400 mt-1">Owner: {ev.task.owner_name ?? "Unassigned"}</p>
                </div>
              ) : (
                <div key={i} className={`rounded-xl border px-4 py-3 ${ev.color}`}>
                  <p className="text-sm font-semibold">{ev.label}</p>
                  {ev.userName && <p className="text-xs mt-0.5 opacity-70">{ev.userName}</p>}
                  {ev.status && (
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_COLORS[ev.status] ?? ""}`}>
                      {ev.status}
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────
export default function CalendarPage() {
  const today = new Date().toISOString().split("T")[0];
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<{ date: string; events: DayEvent[] } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });
  const userId = session?.user?.id ?? "";

  const { data: tasksData, isLoading: tasksLoading } = useQuery<{ tasks: TMTask[] }>({
    queryKey: ["tm-tasks", "all-projects", "active"],
    queryFn: async () => (await api.get(`/task-manager/tasks?include=active`)).data,
  });
  const tasks = tasksData?.tasks ?? [];

  const { data: leaves = [] } = useQuery<Leave[]>({
    queryKey: ["leaves_all"],
    queryFn: async () => {
      const res = await api.get("/leave/all");
      return res.data.data as Leave[];
    },
  });

  const { data: allOffDays = [] } = useQuery<OffDay[]>({
    queryKey: ["off_days_all"],
    queryFn: async () => {
      const res = await api.get("/offday/get_Offday");
      return res.data.data as OffDay[];
    },
  });

  const { data: appraisalDates = [] } = useQuery<AppraisalDate[]>({
    queryKey: ["appraisal_review_dates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("appraisals").select("id, company_id, employee_name, final_review_date").not("final_review_date", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allUsers = [] } = useQuery<{ user_id: string; first_name: string; last_name: string }[]>({
    queryKey: ["users_basic"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("user_id, first_name, last_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    allUsers.forEach((u) => m.set(u.user_id, `${u.first_name} ${u.last_name}`));
    return m;
  }, [allUsers]);

  const userOffDayMap = useMemo(() => {
    const m = new Map<string, OffDay[]>();
    allOffDays.forEach((od) => {
      if (!m.has(od.user_id)) m.set(od.user_id, []);
      m.get(od.user_id)!.push(od);
    });
    m.forEach((rows) => rows.sort((a, b) => b.effective_from.localeCompare(a.effective_from)));
    return m;
  }, [allOffDays]);

  const myOffDaysCount = useMemo(() => {
    const userRows = userOffDayMap.get(userId ?? "") ?? [];
    const activeByDow = new Set<number>();
    userRows.forEach((row) => {
      if (row.effective_from <= today) activeByDow.add(row.day_of_week);
    });
    return activeByDow.size;
  }, [userOffDayMap, userId, today]);

  // Colors are assigned per project in the order projects first appear —
  // stable enough for a session, and needs no separate projects fetch since
  // project_id/project_name already come attached to each task.
  const colorByProject = useMemo(() => {
    const map: Record<string, string> = {};
    let i = 0;
    for (const t of tasks) {
      if (!t.project_id || map[t.project_id]) continue;
      map[t.project_id] = TASK_CHIP_COLORS[i % TASK_CHIP_COLORS.length];
      i++;
    }
    return map;
  }, [tasks]);

  const events = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    const addEvent = (ds: string, ev: DayEvent) => {
      if (!map.has(ds)) map.set(ds, []);
      map.get(ds)!.push(ev);
    };

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      const ds = d.toISOString().split("T")[0];
      userOffDayMap.forEach((rows, uid) => {
        const activeDow = getActiveOffDay(rows, ds);
        if (activeDow === dow) {
          const name = userMap.get(uid) ?? "Team member";
          const isMe = uid === userId;
          addEvent(ds, {
            type: "off",
            label: isMe ? "You — Off" : `${name} off`,
            color: isMe ? "bg-gray-100 text-gray-600" : "bg-slate-50 text-slate-500",
            userName: name,
          });
        }
      });
    }

    leaves.forEach((leave) => {
      const name = userMap.get(leave.user_id) ?? "Team member";
      const isMe = leave.user_id === userId;
      const s = new Date(leave.start_date + "T00:00:00");
      const e = new Date(leave.end_date + "T00:00:00");
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split("T")[0];
        addEvent(ds, {
          type: "leave",
          label: isMe ? `You — ${leave.leave_type}` : `${name} — ${leave.leave_type}`,
          color: leave.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
          userName: name,
          status: leave.status,
        });
      }
    });

    appraisalDates.forEach((ap) => {
      if (!ap.final_review_date) return;
      const ds = ap.final_review_date.split("T")[0];
      addEvent(ds, {
        type: "appraisal",
        label: `Review: ${ap.employee_name}`,
        color: "bg-blue-50 text-blue-700",
        userName: ap.employee_name,
      });
    });

    tasks.forEach((t) => {
      if (!t.due_date) return;
      const ds = t.due_date.slice(0, 10);
      const taskDate = new Date(ds + "T00:00:00");
      if (taskDate.getFullYear() !== year || taskDate.getMonth() !== month) return;
      addEvent(ds, {
        type: "task",
        label: t.title,
        color: colorByProject[t.project_id] ?? "bg-gray-100 text-gray-600",
        task: t,
      });
    });

    return map;
  }, [userOffDayMap, leaves, appraisalDates, tasks, colorByProject, userMap, userId, year, month]);

  const weekDates = useMemo(() => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };

  const headerLabel =
    viewMode === "month"
      ? `${MONTH_NAMES[month]} ${year}`
      : `${weekDates[0].getDate()} ${MONTH_NAMES[weekDates[0].getMonth()]} — ${weekDates[6].getDate()} ${MONTH_NAMES[weekDates[6].getMonth()]} ${year}`;

  const myLeaves = leaves.filter((l) => l.user_id === userId);
  const upcomingAppraisals = appraisalDates.filter((a) => a.final_review_date >= today);
  const myUpcomingTasks = tasks.filter((t) => t.due_date && t.due_date >= today);

  if (tasksLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse text-sm text-gray-400">Loading Calendar…</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6 flex items-center gap-3">
        <div className="w-1 h-8 sm:h-10 rounded-full shrink-0" style={{ background: BRAND }} />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Off days, leave, appraisal reviews, and task deadlines — everything in one place.</p>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: BRAND_LIGHT }}>
            <CalendarDays className="w-5 h-5" style={{ color: BRAND }} />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">My Off Days</p>
            <p className="text-lg sm:text-xl font-black text-gray-800">
              {myOffDaysCount} <span className="text-xs sm:text-sm font-normal text-gray-400">days/week</span>
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">My Leaves</p>
            <p className="text-lg sm:text-xl font-black text-gray-800">
              {myLeaves.length} <span className="text-xs sm:text-sm font-normal text-gray-400">applications</span>
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Upcoming Reviews</p>
            <p className="text-lg sm:text-xl font-black text-gray-800">
              {upcomingAppraisals.length} <span className="text-xs sm:text-sm font-normal text-gray-400">scheduled</span>
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <ListChecks className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Tasks Due</p>
            <p className="text-lg sm:text-xl font-black text-gray-800">
              {myUpcomingTasks.length} <span className="text-xs sm:text-sm font-normal text-gray-400">upcoming</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Calendar ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
          <div className="flex items-center justify-between lg:justify-start gap-2 w-full lg:w-auto">
            <div className="flex items-center gap-1 sm:gap-3">
              <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 transition">
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <h2 className="text-sm sm:text-base font-bold text-gray-900 min-w-[140px] sm:min-w-[220px] text-center">{headerLabel}</h2>
              <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-gray-100 transition">
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <button onClick={() => setCurrentDate(new Date())} className="text-xs px-2.5 py-1.5 rounded-lg border text-gray-500 hover:bg-gray-50 transition" style={{ borderColor: "#e5e7eb" }}>
              Today
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between lg:justify-end gap-3 w-full lg:w-auto">
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] sm:text-xs text-gray-400 order-2 sm:order-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-gray-200 inline-block" /> Off
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-amber-100 inline-block" /> Leave (P)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-emerald-100 inline-block" /> Leave (A)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-blue-100 inline-block" /> Review
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-red-100 inline-block" /> Task
              </div>
            </div>

            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 self-end sm:self-auto order-1 sm:order-2">
              {(["month", "week"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize"
                  style={viewMode === v ? { background: BRAND, color: "#fff", boxShadow: "0 1px 3px rgba(198,40,40,0.3)" } : { color: "#6b7280" }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {viewMode === "month" ? (
          <MonthView year={year} month={month} events={events} today={today} onDayClick={(ds, evs) => setSelectedDay({ date: ds, events: evs })} />
        ) : (
          <WeekView weekDates={weekDates} events={events} today={today} />
        )}
      </div>

      {selectedDay && <DayDetailPanel date={selectedDay.date} events={selectedDay.events} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}
