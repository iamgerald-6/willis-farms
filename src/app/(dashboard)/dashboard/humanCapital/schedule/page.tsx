"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api"; // your axios instance
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Users,
  CalendarDays,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  type: "off" | "leave" | "appraisal";
  label: string;
  color: string;
  userId?: string;
  userName?: string;
  status?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DAY_NAMES_MIN = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ── Brand ──
const BRAND = "#C62828";
const BRAND_LIGHT = "#FFEBEE";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Returns the active day_of_week for a user on a specific date.
 *  userRows must be sorted by effective_from DESC. */
function getActiveOffDay(userRows: OffDay[], date: string): number | null {
  const active = userRows.find((r) => r.effective_from <= date);
  return active?.day_of_week ?? null;
}

/** Format a "YYYY-MM-DD" string as "14 Jun 2026". */
function fmtOffDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Subtract one day from a "YYYY-MM-DD" string. */
function subtractOneDay(d: string): string {
  const dt = new Date(d + "T00:00:00");
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().split("T")[0];
}

// ─── Week View ────────────────────────────────────────────────────────────────
function WeekView({
  weekDates,
  events,
  today,
}: {
  weekDates: Date[];
  events: Map<string, DayEvent[]>;
  today: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAY_NAMES.map((d, idx) => (
        <div
          key={d}
          className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider py-2"
        >
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
            style={
              isToday
                ? { borderColor: BRAND, background: "#FFF5F5" }
                : { borderColor: "#f3f4f6", background: "#fff" }
            }
          >
            <p
              className="text-xs sm:text-sm font-bold mb-1"
              style={isToday ? { color: BRAND } : { color: "#374151" }}
            >
              {date.getDate()}
            </p>
            <div className="space-y-1 flex-1 overflow-y-auto max-h-[70px] no-scrollbar">
              {dayEvents.map((ev, i) => (
                <div
                  key={i}
                  className={`text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded-md font-medium truncate ${ev.color}`}
                >
                  <span className="hidden xs:inline">{ev.label}</span>
                  {/* <span className="inline xs:hidden text-center block font-black">
                    ·
                  </span> */}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────
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
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="grid grid-cols-7 gap-1">
      {DAY_NAMES.map((d, idx) => (
        <div
          key={d}
          className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider py-2"
        >
          <span className="hidden sm:inline">{d}</span>
          <span className="inline sm:hidden">{DAY_NAMES_MIN[idx]}</span>
        </div>
      ))}
      {cells.map((day, i) => {
        if (!day)
          return <div key={i} className="min-h-[60px] sm:min-h-[80px]" />;
        const ds = dateStr(year, month, day);
        const dayEvents = events.get(ds) ?? [];
        const isToday = ds === today;
        return (
          <button
            key={i}
            onClick={() => onDayClick(ds, dayEvents)}
            className="min-h-[60px] sm:min-h-[80px] rounded-xl border p-1 sm:p-2 text-left transition-all hover:shadow-sm flex flex-col justify-between"
            style={
              isToday
                ? { borderColor: BRAND, background: "#FFF5F5" }
                : { borderColor: "#f3f4f6", background: "#fff" }
            }
          >
            <p
              className="text-xs sm:text-sm font-bold mb-1"
              style={isToday ? { color: BRAND } : { color: "#374151" }}
            >
              {day}
            </p>
            <div className="w-full space-y-0.5 overflow-hidden">
              {/* Desktop Indicator */}
              <div className="hidden sm:block space-y-0.5">
                {dayEvents.slice(0, 2).map((ev, j) => (
                  <div
                    key={j}
                    className={`text-[10px] px-1 py-0.5 rounded font-medium truncate ${ev.color}`}
                  >
                    {ev.label}
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <p className="text-[9px] text-gray-400">
                    +{dayEvents.length - 2} more
                  </p>
                )}
              </div>

              {/* Mobile View Indicators */}
              <div className="flex sm:hidden flex-wrap gap-0.5 max-h-[16px] overflow-hidden">
                {dayEvents.map((ev, j) => (
                  <span
                    key={j}
                    className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${
                      ev.type === "off"
                        ? "bg-gray-400"
                        : ev.type === "appraisal"
                          ? "bg-blue-500"
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

// ─── Off Day Selector ─────────────────────────────────────────────────────────
function OffDaySelector({
  selectedDays,
  onToggle,
  saving,
  currentActiveRows,
  allHistory,
}: {
  selectedDays: number[];
  onToggle: (day: number) => void;
  saving: boolean;
  /** Most-recent active off-day row per day_of_week for the current user. */
  currentActiveRows: OffDay[];
  /** All off-day rows for the current user, sorted by effective_from DESC. */
  allHistory: OffDay[];
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  // Build the "current off day" summary line
  const sortedActive = [...currentActiveRows].sort((a, b) =>
    b.effective_from.localeCompare(a.effective_from),
  );
  const activeNames = sortedActive.map((r) => DAY_NAMES_FULL[r.day_of_week]);
  const latestSetDate = sortedActive[0]?.effective_from;

  // Build history display: each row gets a "from" and "to" date
  const historyDisplay = allHistory.map((row, i) => ({
    dayName: DAY_NAMES_FULL[row.day_of_week],
    from: row.effective_from,
    // "to" is the day before the next (more recent) entry, or null if current
    to: i > 0 ? subtractOneDay(allHistory[i - 1].effective_from) : null,
  }));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-800">
            My Recurring Off Days
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Select days you are regularly off each week
          </p>
        </div>
        {saving && (
          <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3" /> Saving…
          </span>
        )}
      </div>

      {/* Day toggle buttons */}
      <div className="flex gap-1.5 sm:gap-2 flex-wrap">
        {DAY_NAMES_FULL.map((name, i) => (
          <button
            key={i}
            onClick={() => onToggle(i)}
            className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold border-2 transition-all"
            style={
              selectedDays.includes(i)
                ? {
                    background: BRAND,
                    color: "#fff",
                    borderColor: BRAND,
                    boxShadow: "0 1px 4px rgba(198,40,40,0.25)",
                  }
                : {
                    background: "#fff",
                    color: "#6b7280",
                    borderColor: "#e5e7eb",
                  }
            }
          >
            <span className="hidden sm:inline">{name}</span>
            <span className="inline sm:hidden">{DAY_NAMES[i]}</span>
          </button>
        ))}
      </div>

      {/* Current active off day + history */}
      {activeNames.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-600">
            Your current off {activeNames.length === 1 ? "day" : "days"}:{" "}
            <strong className="text-gray-800">{activeNames.join(", ")}</strong>
            {latestSetDate && (
              <span className="text-gray-400 ml-1">
                (set {fmtOffDate(latestSetDate)})
              </span>
            )}
          </p>

          {allHistory.length > 1 && (
            <div className="mt-2">
              <button
                onClick={() => setHistoryOpen((p) => !p)}
                className="text-xs font-medium"
                style={{ color: BRAND }}
              >
                {historyOpen ? "Hide history ▲" : "View history ▼"}
              </button>

              {historyOpen && (
                <div className="mt-2 space-y-1.5 pl-1">
                  {historyDisplay.map((h, i) => (
                    <div
                      key={i}
                      className="text-xs text-gray-500 flex items-baseline gap-1.5"
                    >
                      <span className="font-semibold text-gray-700 w-20 shrink-0">
                        {h.dayName}
                      </span>
                      <span>— from {fmtOffDate(h.from)}</span>
                      {h.to === null ? (
                        <span className="text-emerald-600 font-medium">
                          (current)
                        </span>
                      ) : (
                        <span className="text-gray-400">
                          to {fmtOffDate(h.to)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Day Detail Panel ─────────────────────────────────────────────────────────
function DayDetailPanel({
  date,
  events,
  onClose,
}: {
  date: string;
  events: DayEvent[];
  onClose: () => void;
}) {
  const d = new Date(date + "T00:00:00");
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl border border-gray-200 p-6 w-full max-w-md shadow-xl max-h-[85vh] overflow-y-auto transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
              {DAY_NAMES_FULL[d.getDay()]}
            </p>
            <h3 className="text-lg font-bold text-gray-900">
              {d.getDate()} {MONTH_NAMES[d.getMonth()]} {d.getFullYear()}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold p-1 leading-none"
          >
            ×
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No events on this day
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((ev, i) => (
              <div
                key={i}
                className={`rounded-xl border px-4 py-3 ${ev.color}`}
              >
                <p className="text-sm font-semibold">{ev.label}</p>
                {ev.userName && (
                  <p className="text-xs mt-0.5 opacity-70">{ev.userName}</p>
                )}
                {ev.status && (
                  <span
                    className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_COLORS[ev.status] ?? ""}`}
                  >
                    {ev.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SchedulePlannerPage() {
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split("T")[0];
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<{
    date: string;
    events: DayEvent[];
  } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // ── Auth ──
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });
  const userId = session?.user?.id ?? "";

  const { data: leaves = [] } = useQuery<Leave[]>({
    queryKey: ["leaves_all"],
    queryFn: async () => {
      const res = await api.get("/leave/all");
      return res.data.data as Leave[];
    },
  });

  // ── Fetch ALL off day rows (full history, all users) ──
  // No date filter — the frontend computes the active row per user per calendar day.
  const { data: allOffDays = [] } = useQuery<OffDay[]>({
    queryKey: ["off_days_all"],
    queryFn: async () => {
      const res = await api.get("/offday/get_Offday");
      return res.data.data as OffDay[];
    },
  });

  // ── Fetch appraisal review dates ──
  const { data: appraisalDates = [] } = useQuery<AppraisalDate[]>({
    queryKey: ["appraisal_review_dates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appraisals")
        .select("id, company_id, employee_name, final_review_date")
        .not("final_review_date", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Fetch user profiles ──
  const { data: allUsers = [] } = useQuery<
    { user_id: string; first_name: string; last_name: string }[]
  >({
    queryKey: ["users_basic"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_id, first_name, last_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    allUsers.forEach((u) => m.set(u.user_id, `${u.first_name} ${u.last_name}`));
    return m;
  }, [allUsers]);

  // ── Pre-compute per-user off-day lookup (for calendar) ──
  // Maps user_id → their rows sorted by effective_from DESC, enabling O(n) per-day active lookup.
  const userOffDayMap = useMemo(() => {
    const m = new Map<string, OffDay[]>();
    allOffDays.forEach((od) => {
      if (!m.has(od.user_id)) m.set(od.user_id, []);
      m.get(od.user_id)!.push(od);
    });
    m.forEach((rows) =>
      rows.sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    );
    return m;
  }, [allOffDays]);

  // ── My off days — derived from full history for current user ──
  const { myOffDays, myCurrentRows, myHistory } = useMemo(() => {
    const todayStr = today;
    const userRows = (userOffDayMap.get(userId ?? "") ?? []);
    // Find the most-recent active row per day_of_week (effective_from <= today)
    const activeByDow = new Map<number, OffDay>();
    userRows.forEach((row) => {
      if (!activeByDow.has(row.day_of_week) && row.effective_from <= todayStr) {
        activeByDow.set(row.day_of_week, row);
      }
    });
    return {
      myOffDays: Array.from(activeByDow.keys()),
      myCurrentRows: Array.from(activeByDow.values()),
      myHistory: userRows, // already sorted DESC by userOffDayMap
    };
  }, [userOffDayMap, userId, today]);

  const { mutate: saveOffDay, isPending: savingOffDays } = useMutation({
    mutationFn: async ({ day, add }: { day: number; add: boolean }) => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("You must be logged in to modify off days.");
      }

      if (add) {
        await api.post("/offday/create_offDay", {
          user_id: user.id,
          day_of_week: day,
        });
      } else {
        await api.delete(`/offday/${day}`, {
          data: { user_id: user.id },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["off_days_all"] });
    },
  });

  const handleToggleOffDay = (day: number) => {
    const isOn = myOffDays.includes(day);
    saveOffDay({ day, add: !isOn });
  };

  // ── Build events map ──
  const events = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    const addEvent = (ds: string, ev: DayEvent) => {
      if (!map.has(ds)) map.set(ds, []);
      map.get(ds)!.push(ev);
    };

    // For each calendar day, find each user's *active* off day on that specific date.
    // This correctly handles effective_from mid-month changes.
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
            color: isMe
              ? "bg-gray-100 text-gray-600"
              : "bg-slate-50 text-slate-500",
            userId: uid,
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
          label: isMe
            ? `You — ${leave.leave_type}`
            : `${name} — ${leave.leave_type}`,
          color:
            leave.status === "approved"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700",
          userId: leave.user_id,
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

    return map;
  }, [userOffDayMap, leaves, appraisalDates, userMap, userId, year, month]);

  // ── Week dates ──
  const weekDates = useMemo(() => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // ── Navigation ──
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
  const upcomingAppraisals = appraisalDates.filter(
    (a) => a.final_review_date >= today,
  );

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="mb-6 flex items-center gap-3">
        <div
          className="w-1 h-8 sm:h-10 rounded-full shrink-0"
          style={{ background: BRAND }}
        />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Schedule Planner
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Your off days, leaves, and appraisal review dates
          </p>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {/* Off Days */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: BRAND_LIGHT }}
          >
            <CalendarDays className="w-5 h-5" style={{ color: BRAND }} />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
              My Off Days
            </p>
            <p className="text-lg sm:text-xl font-black text-gray-800">
              {myOffDays.length}{" "}
              <span className="text-xs sm:text-sm font-normal text-gray-400">
                days/week
              </span>
            </p>
          </div>
        </div>

        {/* My Leaves */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
              My Leaves
            </p>
            <p className="text-lg sm:text-xl font-black text-gray-800">
              {myLeaves.length}{" "}
              <span className="text-xs sm:text-sm font-normal text-gray-400">
                applications
              </span>
            </p>
          </div>
        </div>

        {/* Upcoming Reviews */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
              Upcoming Reviews
            </p>
            <p className="text-lg sm:text-xl font-black text-gray-800">
              {upcomingAppraisals.length}{" "}
              <span className="text-xs sm:text-sm font-normal text-gray-400">
                scheduled
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Off day selector ── */}
      <div className="mb-6">
        <OffDaySelector
          selectedDays={myOffDays}
          onToggle={handleToggleOffDay}
          saving={savingOffDays}
          currentActiveRows={myCurrentRows}
          allHistory={myHistory}
        />
      </div>

      {/* ── Calendar ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-5">
        {/* Calendar header layout */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
          <div className="flex items-center justify-between lg:justify-start gap-2 w-full lg:w-auto">
            <div className="flex items-center gap-1 sm:gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-lg hover:bg-gray-100 transition"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <h2 className="text-sm sm:text-base font-bold text-gray-900 min-w-[140px] sm:min-w-[220px] text-center">
                {headerLabel}
              </h2>
              <button
                onClick={() => navigate(1)}
                className="p-2 rounded-lg hover:bg-gray-100 transition"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="text-xs px-2.5 py-1.5 rounded-lg border text-gray-500 hover:bg-gray-50 transition"
              style={{ borderColor: "#e5e7eb" }}
            >
              Today
            </button>
          </div>

          {/* Legend + view toggle wrapper */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between lg:justify-end gap-3 w-full lg:w-auto">
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] sm:text-xs text-gray-400 order-2 sm:order-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-gray-200 inline-block" />{" "}
                Off
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-amber-100 inline-block" />{" "}
                Leave (P)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-emerald-100 inline-block" />{" "}
                Leave (A)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-blue-100 inline-block" />{" "}
                Review
              </div>
            </div>

            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 self-end sm:self-auto order-1 sm:order-2">
              {(["month", "week"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize"
                  style={
                    viewMode === v
                      ? {
                          background: BRAND,
                          color: "#fff",
                          boxShadow: "0 1px 3px rgba(198,40,40,0.3)",
                        }
                      : { color: "#6b7280" }
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {viewMode === "month" ? (
          <MonthView
            year={year}
            month={month}
            events={events}
            today={today}
            onDayClick={(ds, evs) => setSelectedDay({ date: ds, events: evs })}
          />
        ) : (
          <WeekView weekDates={weekDates} events={events} today={today} />
        )}
      </div>

      {/* ── My leaves list ── */}
      {myLeaves.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4" style={{ color: BRAND }} />
            My Leave Applications
          </h3>
          <div className="space-y-2">
            {myLeaves.map((leave) => (
              <div
                key={leave.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 gap-2"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {leave.leave_type}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(leave.start_date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {" — "}
                    {new Date(leave.end_date).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {" · "}
                    {leave.total_days} days
                  </p>
                  {leave.reason && (
                    <p className="text-xs text-gray-400 italic mt-0.5 break-words">
                      "{leave.reason}"
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs px-3 py-1 rounded-full font-semibold border self-start sm:self-auto ${STATUS_COLORS[leave.status] ?? ""}`}
                >
                  {leave.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Day detail panel ── */}
      {selectedDay && (
        <DayDetailPanel
          date={selectedDay.date}
          events={selectedDay.events}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
