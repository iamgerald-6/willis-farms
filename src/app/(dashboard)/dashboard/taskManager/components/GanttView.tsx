"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { TMProject, TMTask, DisplayStatus } from "@/types/taskManager";
import { STATUS_STYLES } from "../statusStyles";
import { GanttBarsSkeleton } from "@/components/skeletons/PageSkeletons";
import type { LifecycleViewKey } from "./TaskListView";
import { STATUS_TO_FILTER } from "./SummaryView";

// A typical Gantt look: a fixed task table on the left (Task, Start Date,
// Due Date, Owner, Status, % Complete) and a day-scale calendar on the
// right where each task gets one duration bar running from its start date
// to its due date. The bar's own length is the task's whole duration —
// only the fraction matching % Complete is filled solid; the rest of that
// same bar stays an outline. The calendar header is two rows — a month +
// year row on top (so a multi-year project is unambiguous, not just "Feb"
// with no way to tell which year) and individual day numbers underneath.
const PX_PER_DAY = 24;
const LEFT_PANEL_WIDTH = 760;
// Task, Start Date, Due Date, Owner, Status, Completion% — shared by the
// frozen header panel and every row's frozen panel below it, so the two
// can't drift the way the main task table's columns once could (see
// TASK_TABLE_GRID_COLS in taskManagerConstants.ts for the same fix there).
const GANTT_GRID_COLS = "grid-cols-[2fr_0.9fr_0.9fr_0.9fr_0.8fr_0.7fr]";
// A small frozen gap between the table and the calendar — its own sticky
// element (not just padding/margin on the table panel) so it stays a clean
// filled strip as the calendar scrolls underneath, rather than letting
// calendar content show through a transparent margin.
const PANEL_GAP = 10;

const BAR_FILL: Record<DisplayStatus, string> = {
  "Not Started": "bg-gray-400",
  "In Progress": "bg-amber-500",
  Overdue: "bg-red-500",
  "Compliant / Ongoing": "bg-green-500",
  Completed: "bg-blue-500",
  Archived: "bg-gray-400",
  Deleted: "bg-gray-400",
};
const BAR_BORDER: Record<DisplayStatus, string> = {
  "Not Started": "border-gray-300",
  "In Progress": "border-amber-400",
  Overdue: "border-red-400",
  "Compliant / Ongoing": "border-green-400",
  Completed: "border-blue-400",
  Archived: "border-gray-300",
  Deleted: "border-gray-300",
};
const LEGEND_STATUSES: DisplayStatus[] = ["Not Started", "In Progress", "Overdue", "Compliant / Ongoing", "Completed"];

// Dates are plain "YYYY-MM-DD" — parsed/diffed as UTC midnight so this
// doesn't depend on the server's or browser's local timezone (same
// approach as sendReminders.ts's daysUntil).
function parseUTC(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}
function daysBetween(a: string, b: string): number {
  return Math.round((parseUTC(b) - parseUTC(a)) / 86_400_000);
}
function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

type DayColumn = { iso: string; dayNum: number; monthYearLabel: string; isMonthStart: boolean };

/** One entry per calendar day from `rangeStart` through `rangeEnd` inclusive (both "YYYY-MM-DD"). */
function buildDayColumns(rangeStart: string, rangeEnd: string): DayColumn[] {
  const days: DayColumn[] = [];
  let cursor = parseUTC(rangeStart);
  const end = parseUTC(rangeEnd);
  while (cursor <= end) {
    const dt = new Date(cursor);
    days.push({
      iso: dt.toISOString().slice(0, 10),
      dayNum: dt.getUTCDate(),
      monthYearLabel: dt.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }),
      isMonthStart: dt.getUTCDate() === 1,
    });
    cursor += 86_400_000;
  }
  return days;
}

/** Groups consecutive days sharing the same month+year, for the header's top row — e.g. 28 consecutive "Feb 2026" days become one { label: "Feb 2026", count: 28 } segment. */
function groupByMonth(days: DayColumn[]): { label: string; count: number }[] {
  const groups: { label: string; count: number }[] = [];
  for (const d of days) {
    const last = groups[groups.length - 1];
    if (last && last.label === d.monthYearLabel) last.count++;
    else groups.push({ label: d.monthYearLabel, count: 1 });
  }
  return groups;
}

export default function GanttView({
  project,
  onNavigate,
}: {
  project: TMProject;
  // Same navigation the Summary page's stat cards use (see tasks/page.tsx) —
  // clicking a task row here takes you straight to the Obligation Register
  // or Monitoring Schedule tab, filtered to that task's own status, since
  // each row is one specific task rather than a count like a Summary card.
  onNavigate: (variant: "register" | "monitoring", filter: LifecycleViewKey) => void;
}) {
  const { data, isLoading } = useQuery<{ tasks: TMTask[] }>({
    // Same key SummaryView/TaskListView/ProjectSpanCard use — completed
    // tasks stay on the board until the project itself is closed.
    queryKey: ["tm-tasks", project.id, "active,completed"],
    queryFn: async () => (await api.get(`/task-manager/tasks?project_id=${project.id}&include=active,completed`)).data,
  });

  if (isLoading) return <GanttBarsSkeleton />;

  const allTasks = data?.tasks ?? [];

  // Chronological, like a typical Gantt chart — earliest start date first.
  // Anything with no start date sinks to the bottom rather than sorting
  // arbitrarily among dated tasks.
  const tasks = [...allTasks].sort((a, b) => {
    if (!a.start_date && !b.start_date) return 0;
    if (!a.start_date) return 1;
    if (!b.start_date) return -1;
    return a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0;
  });

  const startDates = allTasks.map((t) => t.start_date).filter((d): d is string => !!d);
  const dueDates = allTasks.map((t) => t.due_date).filter((d): d is string => !!d);
  const earliestStart = startDates.length > 0 ? startDates.reduce((min, d) => (d < min ? d : min)) : null;
  const latestDue = dueDates.length > 0 ? dueDates.reduce((max, d) => (d > max ? d : max)) : null;

  const hasTimeline = !!earliestStart && !!latestDue;
  const timelineStart = earliestStart;
  const days = hasTimeline ? buildDayColumns(earliestStart!, latestDue!) : [];
  const monthGroups = hasTimeline ? groupByMonth(days) : [];
  const timelineWidth = days.length * PX_PER_DAY;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOffsetPx = hasTimeline ? daysBetween(timelineStart!, todayStr) * PX_PER_DAY : null;
  const todayInRange = todayOffsetPx !== null && todayOffsetPx >= 0 && todayOffsetPx <= timelineWidth;

  // A slightly stronger line at the start of each month (rather than every
  // single day looking the same) reinforces the month/year boundaries down
  // through the bars area too, not just in the header above it.
  const gridlines = (
    <div className="absolute inset-0 flex pointer-events-none">
      {days.map((d, i) => (
        <div key={i} className={`shrink-0 border-l ${d.isMonthStart ? "border-gray-200" : "border-gray-50"}`} style={{ width: PX_PER_DAY }} />
      ))}
    </div>
  );
  const todayLine = todayInRange ? (
    <div className="absolute inset-y-0 w-px bg-red-400 z-10" style={{ left: todayOffsetPx! }} title="Today" />
  ) : null;

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No tasks yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: "fit-content" }}>
              {/* Header row */}
              <div className="flex border-b border-gray-100 bg-gray-50/60">
                <div
                  className={`sticky left-0 z-20 bg-gray-50/60 shrink-0 grid ${GANTT_GRID_COLS} gap-2 px-3 py-2 items-center`}
                  style={{ width: LEFT_PANEL_WIDTH }}
                >
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Task</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Start Date</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Due Date</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Owner</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Completion%</p>
                </div>
                <div className="sticky z-20 bg-gray-50/60 shrink-0" style={{ left: LEFT_PANEL_WIDTH, width: PANEL_GAP }} />
                {hasTimeline ? (
                  <div className="relative shrink-0" style={{ width: timelineWidth }}>
                    <div className="flex border-b border-gray-100">
                      {monthGroups.map((g, i) => (
                        <div key={i} className="border-l border-gray-100 px-1.5 py-1 flex items-center shrink-0" style={{ width: g.count * PX_PER_DAY }}>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide truncate">{g.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex">
                      {days.map((d, i) => (
                        <div key={i} className="border-l border-gray-50 flex items-center justify-center shrink-0" style={{ width: PX_PER_DAY }}>
                          <p className="text-[10px] text-gray-400 tabular-nums">{d.dayNum}</p>
                        </div>
                      ))}
                    </div>
                    {todayLine}
                  </div>
                ) : (
                  <div className="shrink-0 flex items-center px-3" style={{ width: 260 }}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Timeline</p>
                  </div>
                )}
              </div>

              {/* Task rows — each is one flex row containing the frozen
                  label cell and the calendar cell as siblings, so a
                  wrapped (never truncated) task title naturally grows both
                  cells together instead of the two sides drifting out of
                  sync. */}
              {tasks.map((t) => {
                const status = t.display_status ?? "Not Started";
                const style = STATUS_STYLES[status];
                const pct = Math.max(0, Math.min(100, t.progress_percent ?? 0));
                const hasBar = hasTimeline && !!t.start_date && !!t.due_date;
                let leftPx = 0;
                let widthPx = 0;
                if (hasBar) {
                  leftPx = daysBetween(timelineStart!, t.start_date!) * PX_PER_DAY;
                  const spanDays = Math.max(1, daysBetween(t.start_date!, t.due_date!) + 1);
                  widthPx = spanDays * PX_PER_DAY;
                }
                // Each row is one specific task, unlike a Summary card
                // (which represents a whole count) — so a click here always
                // goes straight to that task's own variant tab, filtered to
                // its own current status, no "which tab did you mean"
                // picker needed.
                const goToTask = () => onNavigate(t.task_type === "monitoring" ? "monitoring" : "register", STATUS_TO_FILTER[status]);
                return (
                  <div
                    key={t.id}
                    onClick={goToTask}
                    title={`Go to "${t.title}" in ${t.task_type === "monitoring" ? "Monitoring Schedule" : "Obligation Register"}`}
                    className="flex border-b border-gray-50 group cursor-pointer"
                  >
                    <div
                      className={`sticky left-0 z-10 bg-white group-hover:bg-red-50/40 transition shrink-0 grid ${GANTT_GRID_COLS} gap-2 px-3 py-2.5 items-center`}
                      style={{ width: LEFT_PANEL_WIDTH }}
                    >
                      <p className="text-sm font-medium text-gray-800 group-hover:text-red-700">{t.title}</p>
                      <p className="text-xs text-gray-500">{fmtDate(t.start_date)}</p>
                      <p className="text-xs text-gray-500">{fmtDate(t.due_date)}</p>
                      <p className="text-xs text-gray-500">{t.owner_name ?? "Unassigned"}</p>
                      <span className={`inline-flex w-fit px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                        {status}
                      </span>
                      <p className="text-xs font-semibold text-gray-700 tabular-nums">{pct}%</p>
                    </div>
                    <div className="sticky z-10 bg-white group-hover:bg-red-50/40 transition shrink-0" style={{ left: LEFT_PANEL_WIDTH, width: PANEL_GAP }} />

                    {hasTimeline ? (
                      <div className="relative shrink-0 flex items-center group-hover:bg-red-50/40 transition" style={{ width: timelineWidth, minHeight: 44 }}>
                        {gridlines}
                        {todayLine}
                        {hasBar && (
                          <div
                            className={`relative h-4 rounded-md border-2 bg-white overflow-hidden ${BAR_BORDER[status]}`}
                            style={{ marginLeft: leftPx, width: widthPx }}
                            title={`${t.title} — ${pct}% complete (${fmtDate(t.start_date)} → ${fmtDate(t.due_date)})`}
                          >
                            <div className={`h-full ${BAR_FILL[status]}`} style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="shrink-0" style={{ width: 260 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {tasks.length > 0 && !hasTimeline && (
          <p className="text-xs text-gray-400 text-center py-3 border-t border-gray-50">
            No start or due dates set yet — nothing to plot on the timeline.
          </p>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 px-1">
          {LEGEND_STATUSES.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${BAR_FILL[s]}`} />
              <span className="text-[11px] text-gray-500">{s}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-px h-2.5 bg-red-400" />
            <span className="text-[11px] text-gray-500">Today</span>
          </div>
        </div>
      )}
    </div>
  );
}
