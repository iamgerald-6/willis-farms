"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { TMProject } from "@/types/taskManager";
import { isFullRoleAccess } from "@/lib/pagePermissions";
import { getActiveAppraisalPeriod } from "@/lib/appraisal/deadlines";
import { getStatusSummary } from "./humanCapital/appraisal/component/appraisalTypes";
import type { JobApplication } from "@/lib/careers/types";
import { STATUS_LABELS } from "@/lib/careers/types";
import {
  Users,
  CalendarCheck,
  Star,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  ChevronRight,
  X,
} from "lucide-react";
import { DashboardOverviewSkeleton } from "@/components/skeletons/PageSkeletons";
import { formatOverviewGreeting, getModuleRoute } from "@/lib/moduleRegistry";
import {
  DonutChart,
  CategoryBarChart,
  HorizontalBarChart,
  SegmentedBar,
  ScoreRing,
  ScoreHistoryChart,
} from "./components/DashboardCharts";

const BRAND = "#C62828";

// Fixed display order + representative stand-in record for each status the
// Appraisal page can show (see getStatusSummary in appraisalTypes.ts) — used
// to build the Appraisal progress chart's categories below.
const APPRAISAL_STATUS_ORDER: Array<Parameters<typeof getStatusSummary>[0]> = [
  {},
  { submitted_by: "employee" },
  { submitted_by: "supervisor" },
  { submitted_by: "both" },
  { status: "final_reviewed" },
  { status: "reopened" },
  { status: "locked" },
];
// A dedicated palette for the chart, keyed by position in
// APPRAISAL_STATUS_ORDER rather than by tone — two statuses (Supervisor
// Submitted and Both Submitted) share the same "blue" tone on the Appraisal
// page's badges, which would make their bars indistinguishable if this chart
// reused STATUS_TONE_COLOR. Every bar gets its own color instead.
const APPRAISAL_STATUS_CHART_COLORS = [
  "#9ca3af", // Not Started — gray
  "#fbbf24", // Awaiting Supervisor — amber
  "#60a5fa", // Supervisor Submitted — blue
  "#6366f1", // Both Submitted — indigo
  "#34d399", // Final Reviewed — emerald
  "#a78bfa", // Reopened — purple
  "#f87171", // Locked — red
];

// ── Types ─────────────────────────────────────────────────────────────────────
type LeaveRecord = {
  id: string;
  user_id: string;
  leave_type: string;
  reason: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  users?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    role?: string;
  };
};

type AppraisalRecord = {
  id: number;
  employee_name: string;
  review_quarter: string;
  review_year: number;
  // Kept loose (not the old "draft"/"submitted"/"completed" union) — the
  // appraisals API returns the real workflow fields below, and status itself
  // is one of "open" | "submitted" | "final_reviewed" | "locked" | "reopened"
  // (see AppraisalStatus in appraisalTypes.ts). getStatusSummary() is the
  // single source of truth for turning these into a display label; nothing
  // here should re-derive status meaning by comparing this field directly.
  status: string;
  submitted_by?: string | null;
  locked_reason?: string | null;
  appeal_exhausted?: boolean;
  employee_weighted_score: number | null;
  supervisor_weighted_score: number | null;
  promotion_readiness: string;
  reviewing_manager: string | null;
  created_at: string;
};

type SkillLogRecord = {
  id: string | number;
  created_at: string;
  [key: string]: unknown;
};

type SopRecord = {
  id: string | number;
  title?: string;
  created_at: string;
  [key: string]: unknown;
};

// ── Recent activity source types ──────────────────────────────────────────────
// These back the admin/manager/super_admin "sees everything" branch of
// Recent activity — each maps 1:1 onto a GET response shape from its own
// module's API, not a stored column of its own.
type SopAuditEntry = {
  id: string;
  content_id: string;
  content_title: string;
  action: "added" | "edited" | "archived" | "restored" | "deleted";
  performed_by_name: string;
  performed_at: string;
};

type TmAuditEntry = {
  id: string;
  action: string;
  new_values: Record<string, unknown> | null;
  previous_values: Record<string, unknown> | null;
  performed_by_name: string;
  performed_at: string;
  task_id?: string;
  project_id?: string;
};

type TmProjectDeletionEntry = {
  id: string;
  project_name: string;
  deleted_by_name: string;
  deleted_at: string;
};

type ManualVersionRecord = {
  version_id: string;
  version_label: string;
  uploaded_by_name: string;
  uploaded_at: string;
};

type ManualRecord = {
  manual_id: string;
  title: string;
  created_at: string;
  versions: ManualVersionRecord[];
};

type PromotionRecord = {
  id: string;
  employee_name: string;
  proposed_grade: string;
  final_decision: string | null;
  submitted_by_name: string | null;
  created_at: string;
};

type StatCardProps = {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
  accent?: boolean;
  loading?: boolean;
  href?: string;
};

const ROUTE_LEAVE = () => getModuleRoute("mod:leave") ?? "/dashboard/humanCapital/leave";
const ROUTE_APPRAISAL = () =>
  getModuleRoute("mod:appraisal") ?? "/dashboard/humanCapital/appraisal";

type AttentionItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  type: "warning" | "info" | "success";
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function leavePersonName(l: LeaveRecord): string {
  const u = l.users;
  if (u?.first_name || u?.last_name) {
    return [u.first_name, u.last_name].filter(Boolean).join(" ");
  }
  return u?.email?.split("@")[0] ?? "Staff member";
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${new Date(start).toLocaleDateString("en-GB", opts)} – ${new Date(end).toLocaleDateString("en-GB", opts)}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, sub, accent, loading, href }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span
          className={`text-[11px] font-semibold uppercase tracking-widest ${accent ? "text-red-100" : "text-gray-400"}`}
        >
          {label}
        </span>
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent ? "bg-white/20" : "bg-red-50"}`}
        >
          <Icon className={`w-4 h-4 ${accent ? "text-white" : "text-[#C62828]"}`} />
        </div>
      </div>
      <div>
        {loading ? (
          <div className="h-8 w-16 rounded-lg bg-gray-100 animate-pulse" />
        ) : (
          <p className={`text-3xl font-bold tracking-tight ${accent ? "text-white" : "text-gray-900"}`}>
            {value}
          </p>
        )}
        {sub && (
          <p className={`text-xs mt-1 whitespace-pre-line ${accent ? "text-red-100" : "text-gray-400"}`}>
            {sub}
          </p>
        )}
      </div>
    </>
  );

  const className = `rounded-2xl p-5 flex flex-col gap-3 border transition-all ${
    accent
      ? "bg-[#C62828] text-white border-transparent shadow-sm"
      : "bg-white border-gray-100"
  } ${
    href
      ? accent
        ? "hover:shadow-md hover:brightness-110 cursor-pointer"
        : "hover:shadow-md hover:border-red-200 cursor-pointer"
      : "hover:shadow-sm"
  }`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

// Same interaction pattern as the Task Manager Summary page's stat cards
// (see SummaryView.tsx's SummaryCard/VariantPicker): a single matching
// project navigates straight there, more than one opens a small popover to
// pick which project's Summary page to jump to, and zero overdue tasks
// makes the card inert. Kept as its own component rather than reusing
// StatCard because clicking it opens a picker instead of following a plain
// href.
function OverdueTasksCard({
  loading,
  overdueProjects,
  total,
}: {
  loading?: boolean;
  overdueProjects: TMProject[];
  total: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const goToProjectSummary = (projectId: string) => {
    setOpen(false);
    router.push(`/dashboard/taskManager/tasks?project=${projectId}&tab=summary`);
  };

  const clickable = total > 0;

  const handleClick = () => {
    if (!clickable) return;
    if (overdueProjects.length === 1) {
      goToProjectSummary(overdueProjects[0].id);
    } else {
      setOpen((o) => !o);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={!clickable}
        className={`w-full h-full text-left rounded-2xl p-5 flex flex-col gap-3 border bg-white transition-all ${
          open ? "border-red-300 ring-2 ring-red-100" : "border-gray-100"
        } ${clickable ? "hover:shadow-md hover:border-red-200 cursor-pointer" : "hover:shadow-sm cursor-default"}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Overdue Tasks
          </span>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-50">
            <AlertCircle className="w-4 h-4 text-[#C62828]" />
          </div>
        </div>
        <div>
          {loading ? (
            <div className="h-8 w-16 rounded-lg bg-gray-100 animate-pulse" />
          ) : (
            <p className="text-3xl font-bold tracking-tight text-gray-900">{total}</p>
          )}
          <p className="text-xs mt-1 text-gray-400">
            {total === 0
              ? "Nothing overdue"
              : overdueProjects.length === 1
                ? "Past their due date"
                : `Across ${overdueProjects.length} projects`}
          </p>
        </div>
      </button>

      {open && overdueProjects.length > 1 && (
        <div className="absolute z-30 mt-1.5 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <p className="px-3.5 pt-3 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            Go to project…
          </p>
          <div className="pb-1.5 px-1.5 space-y-0.5 max-h-64 overflow-y-auto">
            {overdueProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => goToProjectSummary(p.id)}
                className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 transition"
              >
                <span className="truncate">{p.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{p.overdue_task_count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-5 flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action}
      </div>
      {/* flex-1 so a Panel that's been stretched taller than its own content
          (e.g. sitting next to a taller sibling in a grid row) gives that
          extra space to the content area instead of just padding at the
          bottom — lets children vertically center themselves with h-full. */}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

// Shared row markup between the compact panel preview and the "View all"
// modal, so the two never drift out of sync visually.
function AttentionRows({
  items,
  onItemClick,
}: {
  items: AttentionItem[];
  onItemClick?: () => void;
}) {
  const icon = {
    warning: <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />,
    info: <Clock className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />,
  };

  return (
    <>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          onClick={onItemClick}
          className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
        >
          {icon[item.type]}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 group-hover:text-[#C62828] transition-colors truncate">
              {item.title}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{item.subtitle}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#C62828] flex-shrink-0 mt-0.5" />
        </Link>
      ))}
    </>
  );
}

function AttentionPanel({
  items,
  emptyText,
  columns = 1,
}: {
  items: AttentionItem[];
  emptyText: string;
  // 2 lets a wider panel (e.g. Recent activity spanning the full row) show
  // more of the preview at once instead of leaving the second half empty.
  columns?: 1 | 2;
}) {
  if (!items.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
        <p className="text-sm text-gray-500">{emptyText}</p>
      </div>
    );
  }

  // justify-center/content-center groups a short preview list in the middle
  // of whatever height the panel ends up with (matching its grid-row
  // siblings), instead of stacking rows at the top and leaving a gap
  // underneath.
  return (
    <div
      className={
        columns === 2
          ? "h-full grid grid-cols-1 sm:grid-cols-2 content-center gap-x-2 gap-y-1"
          : "h-full flex flex-col justify-center space-y-1"
      }
    >
      <AttentionRows items={items} />
    </div>
  );
}

// The full, uncapped list — opened from the compact panel's "View all"
// instead of expanding that panel in place (which would blow past the size
// of its grid-row siblings). Every row still links straight to its source
// page and closes the modal on click. Shared by Needs Attention and Recent
// activity so both get identical behavior for free.
function ListModal({
  title,
  items,
  columns = 1,
  onClose,
}: {
  title: string;
  items: AttentionItem[];
  columns?: 1 | 2;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-xl shadow-xl w-full ${columns === 2 ? "max-w-2xl" : "max-w-lg"} max-h-[80vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div
          className={`p-2 overflow-y-auto min-h-0 ${
            columns === 2 ? "grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1" : "space-y-1"
          }`}
        >
          <AttentionRows items={items} onItemClick={onClose} />
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.push("/login");
      return data.session;
    },
  });

  const userId = session?.user?.id;
  const metaRole = session?.user?.user_metadata?.role as string | undefined;
  const isLikelyAdmin =
    metaRole === "admin" || metaRole === "super_admin" || metaRole === "manager";

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => (await api.get("/get_user")).data,
    enabled: !!session,
  });

  const profile = users?.find((u) => u.user_id === userId);
  const role = profile?.role ?? metaRole;
  const isAdmin = isFullRoleAccess(role);

  const { data: leaveData, isLoading: leaveLoading } = useQuery<LeaveRecord[]>({
    queryKey: ["leave", isAdmin ? "all" : userId],
    queryFn: async () => {
      if (isAdmin || isLikelyAdmin) {
        const res = await api.get("/leave/all");
        return Array.isArray(res.data) ? res.data : (res.data.data ?? []);
      }
      const res = await api.get(`/leave/my?user_id=${userId}`);
      return res.data.data ?? [];
    },
    enabled: !!session && !!userId,
  });

  const { data: appraisalData, isLoading: appraisalLoading } = useQuery<AppraisalRecord[]>({
    queryKey: ["appraisal"],
    queryFn: async () => {
      const res = await api.get("/appraisal/get_appraisal");
      return res.data.data ?? [];
    },
    enabled: !!session,
  });

  const { data: skillLogData, isLoading: skillLogLoading } = useQuery<SkillLogRecord[]>({
    queryKey: ["skillLog"],
    queryFn: async () => {
      const res = await api.get("/skillLog/get_skillLog");
      return res.data.data ?? [];
    },
    enabled: !!session,
  });

  const { data: sopData, isLoading: sopLoading } = useQuery<SopRecord[]>({
    queryKey: ["sop"],
    queryFn: async () => {
      const res = await api.get("/sop/get_content");
      return res.data.data ?? [];
    },
    enabled: !!session,
  });

  // Recruitment is an admin surface — only fetch applicant data for viewers
  // who can actually act on it, same gating as the leave "all" branch above.
  const { data: applicationsData } = useQuery<JobApplication[]>({
    queryKey: ["recruitment-applications"],
    queryFn: async () => {
      const res = await api.get("/careers/applications");
      return res.data.data ?? [];
    },
    enabled: !!session && isAdmin,
  });
  const newApplicationsCount = (applicationsData ?? []).filter(
    (a) => a.status === "applied",
  ).length;

  // Recent activity's "sees everything" branch also needs SOP, Task
  // Manager, Policies & Ops, and Promotion activity — all admin-only
  // surfaces, so these only fetch for isAdmin like the applications query
  // above.
  const { data: sopActivityData } = useQuery<SopAuditEntry[]>({
    queryKey: ["sop-activity"],
    queryFn: async () => {
      const res = await api.get("/sop/activity");
      return res.data.entries ?? [];
    },
    enabled: !!session && isAdmin,
  });

  const { data: tmActivityData } = useQuery<{
    tasks: TmAuditEntry[];
    projects: TmAuditEntry[];
    deletions: TmProjectDeletionEntry[];
  }>({
    queryKey: ["tm-activity"],
    queryFn: async () => {
      const res = await api.get("/task-manager/activity");
      return {
        tasks: res.data.tasks ?? [],
        projects: res.data.projects ?? [],
        deletions: res.data.deletions ?? [],
      };
    },
    enabled: !!session && isAdmin,
  });

  const { data: manualsData } = useQuery<ManualRecord[]>({
    queryKey: ["policies-manuals"],
    queryFn: async () => {
      const res = await api.get("/policies/get_policies");
      return res.data.manuals ?? [];
    },
    enabled: !!session && isAdmin,
  });

  const { data: promotionsData } = useQuery<PromotionRecord[]>({
    queryKey: ["promotions"],
    queryFn: async () => {
      const res = await api.get("/promotion/get_promotions");
      return res.data.data ?? [];
    },
    enabled: !!session && isAdmin,
  });

  // /task-manager/projects already scopes to "my projects only" for anyone
  // without canViewAllTasks, and returns each project's own overdue_task_count
  // pre-computed server-side (see GET /api/task-manager/projects) — so this
  // doubles as both the admin-wide and the employee's-own breakdown, and
  // gives the per-project counts the Overdue Tasks card's picker needs.
  const { data: tmProjects, isLoading: tasksLoading } = useQuery<TMProject[]>({
    queryKey: ["overview-tm-projects"],
    queryFn: async () => {
      const res = await api.get("/task-manager/projects");
      return res.data.projects ?? [];
    },
    enabled: !!session,
  });

  const overdueProjects = useMemo(
    () => (tmProjects ?? []).filter((p) => (p.overdue_task_count ?? 0) > 0),
    [tmProjects],
  );
  const overdueTasks = overdueProjects.reduce((sum, p) => sum + (p.overdue_task_count ?? 0), 0);

  const firstName =
    profile?.first_name ?? session?.user?.email?.split("@")[0] ?? "there";

  const pendingLeave = leaveData?.filter((l) => l.status === "pending").length ?? 0;
  const approvedLeave = leaveData?.filter((l) => l.status === "approved").length ?? 0;
  const rejectedLeave = leaveData?.filter((l) => l.status === "rejected").length ?? 0;
  const myLeave = leaveData ?? [];
  const myPendingLeave = myLeave.filter((l) => l.status === "pending").length;
  const myApprovedLeave = myLeave.filter((l) => l.status === "approved").length;
  const myRejectedLeave = myLeave.filter((l) => l.status === "rejected").length;
  const myAppraisals = appraisalData ?? [];
  const latestAppraisal = myAppraisals[0] ?? myAppraisals[myAppraisals.length - 1];

  // "Appraisals" KPI card should only count the period that's currently
  // open for review — not the all-time total — so it stays useful once a
  // few quarters of history pile up. Reuses the same active-period logic
  // the reminder emails and deadline banner are built on, rather than a
  // second definition of "current quarter" that could drift out of sync.
  const currentPeriod = useMemo(() => getActiveAppraisalPeriod(), []);
  const currentPeriodAppraisals = useMemo(
    () =>
      (appraisalData ?? []).filter(
        (a) => a.review_quarter === currentPeriod.quarter && a.review_year === currentPeriod.year,
      ),
    [appraisalData, currentPeriod],
  );
  const myCurrentPeriodAppraisals = useMemo(
    () =>
      myAppraisals.filter(
        (a) => a.review_quarter === currentPeriod.quarter && a.review_year === currentPeriod.year,
      ),
    [myAppraisals, currentPeriod],
  );

  // Awaiting-approval counts, split by whether they belong to the period
  // that's open right now vs. something older still sitting unscored — kept
  // separate rather than one combined number, since a stale prior-quarter
  // backlog reads very differently from this quarter's normal in-flight count.
  const pendingCurrentPeriod = currentPeriodAppraisals.filter(
    (a) => a.supervisor_weighted_score === null,
  ).length;
  const pendingPriorPeriods = (appraisalData ?? []).filter(
    (a) =>
      a.supervisor_weighted_score === null &&
      !(a.review_quarter === currentPeriod.quarter && a.review_year === currentPeriod.year),
  ).length;
  const mySkillLogs = skillLogData ?? [];

  const leaveSegments = useMemo(
    () => [
      { label: "Pending", value: pendingLeave, color: "#fbbf24" },
      { label: "Approved", value: approvedLeave, color: "#34d399" },
      { label: "Rejected", value: rejectedLeave, color: "#f87171" },
    ],
    [pendingLeave, approvedLeave, rejectedLeave],
  );

  const myLeaveSegments = useMemo(
    () => [
      { label: "Pending", value: myPendingLeave, color: "#fbbf24" },
      { label: "Approved", value: myApprovedLeave, color: "#34d399" },
      { label: "Rejected", value: myRejectedLeave, color: "#f87171" },
    ],
    [myPendingLeave, myApprovedLeave, myRejectedLeave],
  );

  // Appraisal progress now reads as "where does the current period stand"
  // rather than a multi-quarter history — one bar per status, scoped to
  // currentPeriodAppraisals (same active-period filter as the KPI card
  // above), not the all-time/all-quarter list.
  //
  // Categories come from getStatusSummary() — the same function that drives
  // the status badges on the Appraisal page itself — rather than a second,
  // hand-rolled status model, so this chart can never drift out of sync with
  // what "Awaiting Supervisor" / "Locked" / etc. actually mean there.
  const appraisalStatusCounts = useMemo(() => {
    const byLabel = new Map<string, { value: number; color: string }>();
    APPRAISAL_STATUS_ORDER.forEach((template, i) => {
      const { label } = getStatusSummary(template);
      if (!byLabel.has(label)) {
        byLabel.set(label, { value: 0, color: APPRAISAL_STATUS_CHART_COLORS[i] });
      }
    });
    for (const a of currentPeriodAppraisals) {
      const { label } = getStatusSummary({
        status: a.status,
        submitted_by: a.submitted_by,
        locked_reason: a.locked_reason,
        appeal_exhausted: a.appeal_exhausted,
      });
      const entry = byLabel.get(label);
      if (entry) entry.value += 1;
    }
    // Only show statuses this period actually has — a status with zero
    // appraisals in it doesn't get an empty bar taking up space.
    return Array.from(byLabel.entries())
      .filter(([, { value }]) => value > 0)
      .map(([label, { value, color }]) => ({ label, value, color }));
  }, [currentPeriodAppraisals]);

  const scoreHistory = useMemo(
    () =>
      [...myAppraisals]
        .slice(0, 6)
        .reverse()
        .map((a) => ({
          label: `${a.review_quarter.slice(0, 2)} ${String(a.review_year).slice(2)}`,
          score: a.employee_weighted_score,
        })),
    [myAppraisals],
  );

  // Full, uncapped list — "View all" in the panel now expands in place
  // instead of navigating to the Leave page, so the cap that used to live
  // here (and the pretense that "view all" meant "view all leave requests")
  // is gone. Display-time slicing for the collapsed state happens where
  // this is rendered.
  const adminAttentionItems = useMemo((): AttentionItem[] => {
    const items: AttentionItem[] = [];
    leaveData
      ?.filter((l) => l.status === "pending")
      .forEach((l) => {
        items.push({
          id: `leave-${l.id}`,
          title: `${leavePersonName(l)} — ${l.leave_type} leave`,
          subtitle: formatDateRange(l.start_date, l.end_date),
          href: ROUTE_LEAVE(),
          type: "warning",
        });
      });
    appraisalData
      ?.filter((a) => a.status === "draft")
      .forEach((a) => {
        items.push({
          id: `appraisal-${a.id}`,
          title: `${a.employee_name} — ${a.review_quarter} ${a.review_year}`,
          subtitle: "Appraisal draft in progress",
          href: ROUTE_APPRAISAL(),
          type: "info",
        });
      });
    // One entry per project with overdue tasks (same overdueProjects the
    // Overdue Tasks KPI card uses) rather than per individual task — the
    // per-task list isn't fetched on this page, and the project's Summary
    // tab is exactly where the KPI card's own picker already sends you.
    overdueProjects.forEach((p) => {
      items.push({
        id: `overdue-${p.id}`,
        title: `${p.name} — ${p.overdue_task_count} overdue task${p.overdue_task_count === 1 ? "" : "s"}`,
        subtitle: "Task Manager",
        href: `/dashboard/taskManager/tasks?project=${p.id}&tab=summary`,
        type: "warning",
      });
    });
    // One aggregated entry rather than one per applicant — an inbox of
    // fresh applications reads better as a single "go triage these" prompt
    // than a name-by-name list, unlike leave/appraisal items which are each
    // their own actionable record.
    if (newApplicationsCount > 0) {
      items.push({
        id: "recruitment-new-applications",
        title: `${newApplicationsCount} new application${newApplicationsCount === 1 ? "" : "s"} available`,
        subtitle: "Recruitment",
        href: "/dashboard/humanCapital/recruitment",
        type: "info",
      });
    }
    return items;
  }, [leaveData, appraisalData, overdueProjects, newApplicationsCount]);

  const employeeAttentionItems = useMemo((): AttentionItem[] => {
    const items: AttentionItem[] = [];
    myLeave
      .filter((l) => l.status === "pending")
      .slice(0, 2)
      .forEach((l) => {
        items.push({
          id: `leave-${l.id}`,
          title: `${l.leave_type} leave pending approval`,
          subtitle: formatDateRange(l.start_date, l.end_date),
          href: ROUTE_LEAVE(),
          type: "warning",
        });
      });
    if (latestAppraisal?.status === "draft") {
      items.push({
        id: `appraisal-${latestAppraisal.id}`,
        title: `Complete ${latestAppraisal.review_quarter} ${latestAppraisal.review_year} appraisal`,
        subtitle: "Draft awaiting submission",
        href: ROUTE_APPRAISAL(),
        type: "info",
      });
    }
    return items;
  }, [myLeave, latestAppraisal]);

  // Recent activity's visibility follows the same admin/manager/super_admin
  // gate the rest of this page already uses for "see everyone's records"
  // (leaveData is only the full company list when isAdmin — /leave/all is
  // role-gated server-side, not grade-based — so this stays consistent with
  // what the viewer's other queries actually return rather than promising a
  // grade-based "L4+ sees everyone" rule the APIs don't back up).
  const activityItems = useMemo((): AttentionItem[] => {
    const rows: { time: number; module: string; item: AttentionItem }[] = [];
    const add = (createdAt: string, module: string, item: AttentionItem) => {
      rows.push({ time: new Date(createdAt).getTime(), module, item });
    };

    if (isAdmin) {
      leaveData?.forEach((l) => {
        add(l.created_at, "Leave", {
          id: `leave-${l.id}`,
          title: `${leavePersonName(l)} — ${l.leave_type} leave`,
          subtitle: `${l.status} · ${timeAgo(l.created_at)}`,
          href: "/dashboard/humanCapital/leave",
          type: l.status === "pending" ? "warning" : l.status === "approved" ? "success" : "info",
        });
      });
      appraisalData?.forEach((a) => {
        add(a.created_at, "Appraisal", {
          id: `appraisal-${a.id}`,
          title: `${a.employee_name} — ${a.review_quarter} ${a.review_year}`,
          subtitle: `score ${a.employee_weighted_score ?? "pending"} · ${timeAgo(a.created_at)}`,
          href: "/dashboard/humanCapital/appraisal",
          type: a.status === "draft" ? "warning" : "success",
        });
      });

      const sopVerb: Record<SopAuditEntry["action"], string> = {
        added: "uploaded",
        edited: "edited",
        archived: "archived",
        restored: "restored",
        deleted: "deleted",
      };
      sopActivityData?.forEach((e) => {
        add(e.performed_at, "SOP", {
          id: `sop-${e.id}`,
          title: `${e.performed_by_name} ${sopVerb[e.action] ?? e.action} "${e.content_title}"`,
          subtitle: `SOP · ${timeAgo(e.performed_at)}`,
          href: "/dashboard/sop",
          type: e.action === "archived" || e.action === "deleted" ? "warning" : "success",
        });
      });

      const projectNameById = new Map((tmProjects ?? []).map((p) => [p.id, p.name]));
      const tmTaskVerb: Record<string, string> = {
        created: "created",
        edited: "updated",
        completed: "completed",
        archived: "archived",
        deleted: "deleted",
        restored: "restored",
      };
      tmActivityData?.tasks.forEach((e) => {
        const title =
          (e.new_values?.title as string | undefined) ??
          (e.previous_values?.title as string | undefined) ??
          "a task";
        const project = e.project_id ? (projectNameById.get(e.project_id) ?? "Task Manager") : "Task Manager";
        add(e.performed_at, "Task Manager", {
          id: `tm-task-${e.id}`,
          title: `${e.performed_by_name} ${tmTaskVerb[e.action] ?? e.action} "${title}"`,
          subtitle: `${project} · ${timeAgo(e.performed_at)}`,
          href: "/dashboard/taskManager/tasks",
          type:
            e.action === "completed"
              ? "success"
              : e.action === "deleted" || e.action === "archived"
                ? "warning"
                : "info",
        });
      });
      const tmProjectVerb: Record<string, string> = {
        created: "created",
        renamed: "renamed",
        archived: "archived",
        restored: "restored",
      };
      tmActivityData?.projects.forEach((e) => {
        const name =
          (e.new_values?.name as string | undefined) ??
          (e.previous_values?.name as string | undefined) ??
          (e.project_id ? projectNameById.get(e.project_id) : undefined) ??
          "a project";
        add(e.performed_at, "Task Manager", {
          id: `tm-project-${e.id}`,
          title: `${e.performed_by_name} ${tmProjectVerb[e.action] ?? e.action} project "${name}"`,
          subtitle: `Task Manager · ${timeAgo(e.performed_at)}`,
          href: "/dashboard/taskManager/tasks",
          type: e.action === "archived" ? "warning" : "info",
        });
      });
      tmActivityData?.deletions.forEach((d) => {
        add(d.deleted_at, "Task Manager", {
          id: `tm-deletion-${d.id}`,
          title: `${d.deleted_by_name} permanently deleted project "${d.project_name}"`,
          subtitle: `Task Manager · ${timeAgo(d.deleted_at)}`,
          href: "/dashboard/taskManager/tasks",
          type: "warning",
        });
      });

      manualsData?.forEach((m) => {
        const versions = [...m.versions].sort(
          (a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime(),
        );
        if (versions.length === 0) {
          add(m.created_at, "Policies & Ops", {
            id: `manual-${m.manual_id}`,
            title: `"${m.title}" uploaded`,
            subtitle: `Policies & Ops · ${timeAgo(m.created_at)}`,
            href: "/dashboard/policies",
            type: "success",
          });
          return;
        }
        versions.forEach((v, i) => {
          add(v.uploaded_at, "Policies & Ops", {
            id: `manual-${m.manual_id}-${v.version_id}`,
            title: `${v.uploaded_by_name} ${i === 0 ? "uploaded" : "updated"} "${m.title}"`,
            subtitle: `Policies & Ops · ${timeAgo(v.uploaded_at)}`,
            href: "/dashboard/policies",
            type: "success",
          });
        });
      });

      applicationsData?.forEach((a) => {
        add(a.created_at, "Recruitment", {
          id: `application-${a.id}`,
          title: `${a.full_name} applied for ${a.role_title}`,
          subtitle: `${STATUS_LABELS[a.status]} · ${timeAgo(a.created_at)}`,
          href: "/dashboard/humanCapital/recruitment",
          type: a.status === "rejected" ? "warning" : a.status === "offer" ? "success" : "info",
        });
      });

      promotionsData?.forEach((p) => {
        add(p.created_at, "Promotion", {
          id: `promotion-${p.id}`,
          title: `${p.employee_name} — promotion to ${p.proposed_grade}`,
          subtitle: `${p.final_decision ? p.final_decision.replace(/_/g, " ") : "pending decision"} · ${timeAgo(p.created_at)}`,
          href: "/dashboard/humanCapital/promotion",
          type: p.final_decision?.includes("promote") ? "success" : "info",
        });
      });
    } else {
      myLeave.forEach((l) => {
        add(l.created_at, "Leave", {
          id: `leave-${l.id}`,
          title: `${l.leave_type} leave (${l.total_days} days)`,
          subtitle: `${l.status} · ${timeAgo(l.created_at)}`,
          href: "/dashboard/humanCapital/leave",
          type: l.status === "pending" ? "warning" : l.status === "approved" ? "success" : "info",
        });
      });
      myAppraisals.forEach((a) => {
        add(a.created_at, "Appraisal", {
          id: `appraisal-${a.id}`,
          title: `${a.review_quarter} ${a.review_year} appraisal`,
          subtitle: `score ${a.employee_weighted_score ?? "pending"} · ${timeAgo(a.created_at)}`,
          href: "/dashboard/humanCapital/appraisal",
          type: a.status === "draft" ? "info" : "success",
        });
      });
      mySkillLogs.forEach((s) => {
        add(s.created_at, "Skill Log", {
          id: `skill-${s.id}`,
          title: "Skill log entry recorded",
          subtitle: timeAgo(s.created_at),
          href: "/dashboard/humanCapital/skillLog",
          type: "success",
        });
      });
    }

    // Merging leave + appraisal (+ skill logs, SOP, Task Manager, Policies,
    // Recruitment, Promotion) needs an explicit sort — each source is
    // already newest-first on its own, but interleaving them into one feed
    // only reads as a coherent timeline if it's re-sorted by actual recency.
    //
    // Capped to this calendar month, most-recent 20 overall — otherwise a
    // platform-wide feed only grows over time with nothing to bound it.
    //
    // A pure global "most recent 20" cut lets high-volume modules (Task
    // Manager, SOP) crowd out modules that log fewer, coarser-grained
    // events (Recruitment currently only logs one event per application,
    // at submission) — so a module with real activity this month could
    // still show zero items. To guarantee every active module is actually
    // represented, first reserve a few of each module's own most-recent
    // items, then fill any remaining slots with whatever's most recent
    // overall.
    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).getTime();
    const TOTAL_CAP = 20;
    const RESERVED_PER_MODULE = 3;

    const thisMonth = rows.filter((r) => r.time >= monthStart);

    const byModule = new Map<string, typeof rows>();
    for (const r of thisMonth) {
      const list = byModule.get(r.module);
      if (list) list.push(r);
      else byModule.set(r.module, [r]);
    }

    const reserved: typeof rows = [];
    const remainder: typeof rows = [];
    for (const list of byModule.values()) {
      list.sort((a, b) => b.time - a.time);
      reserved.push(...list.slice(0, RESERVED_PER_MODULE));
      remainder.push(...list.slice(RESERVED_PER_MODULE));
    }

    const remainingSlots = Math.max(0, TOTAL_CAP - reserved.length);
    const fill = remainder
      .sort((a, b) => b.time - a.time)
      .slice(0, remainingSlots);

    return [...reserved, ...fill]
      .sort((a, b) => b.time - a.time)
      .slice(0, TOTAL_CAP)
      .map((r) => r.item);
  }, [
    isAdmin,
    leaveData,
    appraisalData,
    myLeave,
    myAppraisals,
    mySkillLogs,
    sopActivityData,
    tmActivityData,
    tmProjects,
    manualsData,
    applicationsData,
    promotionsData,
  ]);

  const coreLoading = usersLoading || leaveLoading || appraisalLoading;
  if (coreLoading) {
    return <DashboardOverviewSkeleton />;
  }

  // 6 in a 2-column preview (admin, full-width panel) vs 4 in a single
  // column (employee, half-width panel) — roughly the same visual amount
  // either way.
  const activityPreviewCount = isAdmin ? 6 : 4;

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const staffRoleBars = [
    {
      label: "Employees",
      value: users?.filter((u) => u.role === "employee").length ?? 0,
      color: BRAND,
    },
    {
      label: "Admins",
      value: users?.filter((u) => u.role === "admin").length ?? 0,
      color: "#6b7280",
    },
    {
      label: "Super Admins",
      value: users?.filter((u) => u.role === "super_admin").length ?? 0,
      color: "#374151",
    },
    {
      label: "Managers",
      value: users?.filter((u) => u.role === "manager").length ?? 0,
      color: "#9ca3af",
    },
  ].filter((x) => x.value > 0);

  return (
    <div className="bg-white min-h-full">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Hero */}
        <div className="bg-white rounded-2xl border border-gray-100 border-l-4 border-l-[#C62828] p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                {formatOverviewGreeting(firstName, greeting)}
              </h1>
              <p className="text-sm text-gray-500 mt-1">{dateStr}</p>
            </div>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-red-50 border border-red-100 text-xs font-semibold text-[#C62828] self-start capitalize">
              {role?.replace("_", " ") ?? "Employee"}
            </span>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {isAdmin ? (
            <>
              <StatCard
                accent
                label="Total Staff"
                value={users?.length ?? "—"}
                icon={Users}
                sub={`${users?.filter((u) => u.role === "employee").length ?? 0} employees`}
              />
              <StatCard
                label="Pending Leave"
                value={pendingLeave}
                icon={CalendarCheck}
                sub={`${approvedLeave} approved`}
                href="/dashboard/humanCapital/leave"
              />
              <StatCard
                label="Appraisals"
                value={appraisalData ? currentPeriodAppraisals.length : "—"}
                icon={Star}
                sub={`${pendingCurrentPeriod} awaiting approval (${currentPeriod.quarter} ${currentPeriod.year})\n${pendingPriorPeriods} awaiting approval (prior quarters)`}
                href="/dashboard/humanCapital/appraisal"
              />
              <StatCard
                label="SOPs"
                value={sopData?.length ?? "—"}
                icon={FileText}
                sub="Active procedures"
                loading={sopLoading}
                href="/dashboard/sop"
              />
              <OverdueTasksCard
                loading={tasksLoading}
                overdueProjects={overdueProjects}
                total={overdueTasks}
              />
            </>
          ) : (
            <>
              <StatCard
                accent
                label="Leave Pending"
                value={myPendingLeave}
                icon={CalendarCheck}
                sub={`${myApprovedLeave} approved`}
                href="/dashboard/humanCapital/leave"
              />
              <StatCard
                label="Appraisals"
                value={myCurrentPeriodAppraisals.length}
                icon={Star}
                sub={`${currentPeriod.quarter} ${currentPeriod.year}${
                  myCurrentPeriodAppraisals.length === 0 ? " · None yet" : ""
                }`}
                href="/dashboard/humanCapital/appraisal"
              />
              <StatCard
                label="Skill Logs"
                value={mySkillLogs.length}
                icon={ClipboardList}
                sub="Entries recorded"
                loading={skillLogLoading}
                href="/dashboard/humanCapital/skillLog"
              />
              <StatCard
                label="SOPs"
                value={sopData?.length ?? "—"}
                icon={FileText}
                sub="Available to you"
                loading={sopLoading}
                href="/dashboard/sop"
              />
              <OverdueTasksCard
                loading={tasksLoading}
                overdueProjects={overdueProjects}
                total={overdueTasks}
              />
            </>
          )}
        </div>

        {/* Charts + attention */}
        {isAdmin ? (
          <>
            {/* Default stretch (not items-start) — all three cards match the
                tallest one (Appraisal progress). Each card's own content is
                vertically centered within that shared height (see the h-full
                wrappers below) so the extra room reads as intentional
                breathing space, not leftover whitespace at the bottom. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Panel title="Leave requests" className="lg:col-span-1">
                <div className="h-full flex items-center justify-center">
                  <DonutChart
                    segments={leaveSegments}
                    centerLabel={String((leaveData?.length ?? 0))}
                    centerSub="total"
                  />
                </div>
              </Panel>
              <Panel
                title="Appraisal progress"
                action={
                  <span className="text-xs text-gray-400">
                    {currentPeriod.quarter} {currentPeriod.year}
                  </span>
                }
                className="lg:col-span-1"
              >
                {currentPeriodAppraisals.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">
                    No appraisals for this period yet
                  </p>
                ) : (
                  <CategoryBarChart items={appraisalStatusCounts} />
                )}
              </Panel>
              <Panel
                title="Needs attention"
                action={
                  adminAttentionItems.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllAttention(true)}
                      className="text-xs text-[#C62828] font-medium hover:underline"
                    >
                      View all
                    </button>
                  )
                }
                className="lg:col-span-1"
              >
                {/* 3 rows keeps this panel's natural height in line with its
                    Leave requests / Appraisal progress siblings — anything
                    beyond that is one tap away via "View all". */}
                <AttentionPanel
                  items={adminAttentionItems.slice(0, 3)}
                  emptyText="All caught up — nothing needs attention"
                />
              </Panel>
            </div>

            {showAllAttention && (
              <ListModal
                title="Needs attention"
                items={adminAttentionItems}
                onClose={() => setShowAllAttention(false)}
              />
            )}

            {staffRoleBars.length > 0 && (
              <Panel title="Staff by role">
                <HorizontalBarChart items={staffRoleBars} />
              </Panel>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Panel title="Your appraisal score" className="lg:col-span-1">
                {latestAppraisal ? (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <ScoreRing score={latestAppraisal.employee_weighted_score} />
                    <div className="flex-1 text-center sm:text-left">
                      <p className="text-lg font-bold text-gray-900">
                        {latestAppraisal.review_quarter} {latestAppraisal.review_year}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Supervisor: {latestAppraisal.reviewing_manager ?? "Not assigned"}
                      </p>
                      <span
                        className={`inline-flex mt-3 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          latestAppraisal.status === "draft"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {latestAppraisal.status}
                      </span>
                      {latestAppraisal.supervisor_weighted_score != null && (
                        <p className="text-xs text-gray-400 mt-2">
                          Supervisor score: {latestAppraisal.supervisor_weighted_score}/4
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">No appraisals yet</p>
                )}
              </Panel>

              <Panel title="My leave" className="lg:col-span-1">
                <div className="pt-2 pb-4">
                  <SegmentedBar segments={myLeaveSegments} />
                </div>
                <p className="text-xs text-gray-400 text-center">
                  {myLeave.length} total request{myLeave.length !== 1 ? "s" : ""}
                </p>
              </Panel>

              <Panel title="My snapshot" className="lg:col-span-1">
                <AttentionPanel
                  items={employeeAttentionItems}
                  emptyText="You're all set — no pending actions"
                />
              </Panel>
            </div>

            {scoreHistory.length > 1 && (
              <Panel title="Score history">
                <ScoreHistoryChart items={scoreHistory} />
              </Panel>
            )}
          </>
        )}

        {/* Activity + appraisal details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel
            title="Recent activity"
            action={
              activityItems.length > activityPreviewCount && (
                <button
                  type="button"
                  onClick={() => setShowAllActivity(true)}
                  className="text-xs text-[#C62828] font-medium hover:underline"
                >
                  View all
                </button>
              )
            }
            className={isAdmin ? "lg:col-span-2" : undefined}
          >
            <AttentionPanel
              items={activityItems.slice(0, activityPreviewCount)}
              emptyText="No recent activity"
              columns={isAdmin ? 2 : 1}
            />
          </Panel>

          {!isAdmin && latestAppraisal && (
            <Panel title="Appraisal details">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Your score</p>
                  <p className="text-2xl font-bold text-[#C62828] mt-1">
                    {latestAppraisal.employee_weighted_score ?? "—"}
                    <span className="text-sm text-gray-400 font-normal"> / 4</span>
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Supervisor</p>
                  <p className="text-2xl font-bold text-gray-700 mt-1">
                    {latestAppraisal.supervisor_weighted_score ?? "—"}
                    <span className="text-sm text-gray-400 font-normal"> / 4</span>
                  </p>
                </div>
                <div className="col-span-2 rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Promotion readiness</p>
                  <p className="text-sm font-medium text-gray-800 mt-1 capitalize">
                    {latestAppraisal.promotion_readiness?.replace(/_/g, " ") ?? "—"}
                  </p>
                </div>
              </div>
            </Panel>
          )}
        </div>

        {showAllActivity && (
          <ListModal
            title="Recent activity"
            items={activityItems}
            columns={isAdmin ? 2 : 1}
            onClose={() => setShowAllActivity(false)}
          />
        )}
      </div>
    </div>
  );
}
