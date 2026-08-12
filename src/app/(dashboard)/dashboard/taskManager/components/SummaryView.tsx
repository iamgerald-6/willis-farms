"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { TMProject, TMTask, DisplayStatus } from "@/types/taskManager";
import { STATUS_STYLES } from "../statusStyles";
import { SummaryCardsSkeleton } from "@/components/skeletons/PageSkeletons";
import type { LifecycleViewKey } from "./TaskListView";

// "Completed" is deliberately included here now — a finished task is still
// part of the project's story, and hiding it entirely (the old behavior,
// back when this only fetched include=active) made it look like completed
// work just vanished from the summary.
const STATUS_ORDER: DisplayStatus[] = ["Overdue", "In Progress", "Not Started", "Compliant / Ongoing", "Completed"];

// Maps a status straight onto the matching filter tab in Obligation
// Register / Monitoring Schedule (see TaskListView.tsx's LIFECYCLE_VIEWS) —
// clicking "2 overdue" here (or a specific overdue task in GanttView) should
// land exactly on the Overdue tab over there, not just the unfiltered list.
// Exported so GanttView can reuse the same mapping for its own row clicks
// rather than keeping a second copy in sync.
export const STATUS_TO_FILTER: Record<DisplayStatus, LifecycleViewKey> = {
  Overdue: "overdue",
  "In Progress": "in_progress",
  "Not Started": "not_started",
  "Compliant / Ongoing": "ongoing",
  Completed: "completed",
  Archived: "archived",
  Deleted: "deleted",
};

type VariantCounts = { register: number; monitoring: number };

function addTask(counts: VariantCounts, t: TMTask): VariantCounts {
  return t.task_type === "monitoring"
    ? { ...counts, monitoring: counts.monitoring + 1 }
    : { ...counts, register: counts.register + 1 };
}

export default function SummaryView({
  project,
  onNavigate,
}: {
  project: TMProject;
  // Takes the reviewer to a specific filter tab on either the Obligation
  // Register or the Monitoring Schedule — see tasks/page.tsx, which owns
  // the tab switch + forces TaskListView to remount on the right filter.
  onNavigate: (variant: "register" | "monitoring", filter: LifecycleViewKey) => void;
}) {
  const { data, isLoading } = useQuery<{ tasks: TMTask[] }>({
    // Same key/scope TaskListView and GanttView use by default — completed
    // tasks stay visible here (see STATUS_ORDER above), not just active ones.
    queryKey: ["tm-tasks", project.id, "active,completed"],
    queryFn: async () => (await api.get(`/task-manager/tasks?project_id=${project.id}&include=active,completed`)).data,
  });

  const tasks = data?.tasks ?? [];
  const counts: Record<string, number> = {};
  const countsByVariant: Record<string, VariantCounts> = {};
  let totalByVariant: VariantCounts = { register: 0, monitoring: 0 };
  for (const t of tasks) {
    const s = t.display_status ?? "Not Started";
    counts[s] = (counts[s] ?? 0) + 1;
    countsByVariant[s] = addTask(countsByVariant[s] ?? { register: 0, monitoring: 0 }, t);
    totalByVariant = addTask(totalByVariant, t);
  }

  const upcoming = [...tasks]
    .filter((t) => t.due_date && t.display_status !== "Completed")
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5);

  // Which card's "pick a tab" popover is open — null means none. A card
  // only needs this when its tasks are split across both Register and
  // Monitoring; otherwise a click just navigates straight there.
  const [picker, setPicker] = useState<{ filter: LifecycleViewKey; byVariant: VariantCounts } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) setPicker(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCardClick = (filter: LifecycleViewKey, byVariant: VariantCounts) => {
    const total = byVariant.register + byVariant.monitoring;
    if (total === 0) return;
    if (byVariant.register > 0 && byVariant.monitoring === 0) return onNavigate("register", filter);
    if (byVariant.monitoring > 0 && byVariant.register === 0) return onNavigate("monitoring", filter);
    setPicker((prev) => (prev?.filter === filter ? null : { filter, byVariant }));
  };

  if (isLoading) return <SummaryCardsSkeleton />;

  return (
    <div>
      <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <SummaryCard
          count={tasks.length}
          label="Total tasks"
          clickable={tasks.length > 0}
          open={picker?.filter === "all"}
          onClick={() => handleCardClick("all", totalByVariant)}
        >
          {picker?.filter === "all" && (
            <VariantPicker byVariant={totalByVariant} onPick={(v) => onNavigate(v, "all")} />
          )}
        </SummaryCard>
        {STATUS_ORDER.map((s) => {
          const filter = STATUS_TO_FILTER[s];
          const byVariant = countsByVariant[s] ?? { register: 0, monitoring: 0 };
          return (
            <SummaryCard
              key={s}
              count={counts[s] ?? 0}
              label={s}
              textClass={STATUS_STYLES[s].text}
              clickable={(counts[s] ?? 0) > 0}
              open={picker?.filter === filter}
              onClick={() => handleCardClick(filter, byVariant)}
            >
              {picker?.filter === filter && (
                <VariantPicker byVariant={byVariant} onPick={(v) => onNavigate(v, filter)} />
              )}
            </SummaryCard>
          );
        })}
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

function SummaryCard({
  count,
  label,
  textClass,
  clickable,
  open,
  onClick,
  children,
}: {
  count: number;
  label: string;
  textClass?: string;
  clickable: boolean;
  open: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={!clickable}
        className={`w-full text-left bg-white rounded-xl border shadow-sm p-4 transition ${
          open ? "border-red-300 ring-2 ring-red-100" : "border-gray-100"
        } ${clickable ? "hover:border-red-200 hover:shadow-md cursor-pointer" : "cursor-default"}`}
      >
        <p className={`text-2xl font-bold ${textClass ?? "text-gray-900"}`}>{count}</p>
        <p className="text-xs text-gray-500 mt-1">{label}</p>
      </button>
      {children}
    </div>
  );
}

// Shown when a card's tasks are split across both Register and Monitoring —
// lets the reviewer pick which one to jump to instead of guessing.
function VariantPicker({
  byVariant,
  onPick,
}: {
  byVariant: VariantCounts;
  onPick: (variant: "register" | "monitoring") => void;
}) {
  return (
    <div className="absolute z-20 mt-1.5 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
      <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Go to…</p>
      <div className="pb-1.5 px-1.5 space-y-0.5">
        {byVariant.register > 0 && (
          <button
            onClick={() => onPick("register")}
            className="w-full text-left px-2.5 py-1.5 rounded-md text-sm text-gray-700 hover:bg-red-50 hover:text-red-700"
          >
            Obligation Register <span className="text-gray-400">({byVariant.register})</span>
          </button>
        )}
        {byVariant.monitoring > 0 && (
          <button
            onClick={() => onPick("monitoring")}
            className="w-full text-left px-2.5 py-1.5 rounded-md text-sm text-gray-700 hover:bg-red-50 hover:text-red-700"
          >
            Monitoring Schedule <span className="text-gray-400">({byVariant.monitoring})</span>
          </button>
        )}
      </div>
    </div>
  );
}
