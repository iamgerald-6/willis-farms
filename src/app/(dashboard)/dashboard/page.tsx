"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import {
  Users,
  BookOpen,
  CalendarCheck,
  Star,
  ClipboardList,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  ChevronRight,
} from "lucide-react";
import { DashboardOverviewSkeleton } from "@/components/skeletons/PageSkeletons";
import {
  DonutChart,
  AppraisalBarChart,
  HorizontalBarChart,
  SegmentedBar,
  ScoreRing,
  ScoreHistoryChart,
} from "./components/DashboardCharts";

const BRAND = "#C62828";

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
  status: "draft" | "submitted" | "completed";
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

type StatCardProps = {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
  accent?: boolean;
  loading?: boolean;
};

type QuickActionProps = {
  label: string;
  href: string;
  icon: React.ElementType;
};

type AttentionItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  type: "warning" | "info";
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

function groupAppraisalsByQuarter(data: AppraisalRecord[]) {
  const map = new Map<string, { draft: number; done: number }>();
  for (const a of data) {
    const key = `${a.review_quarter} ${a.review_year}`;
    const cur = map.get(key) ?? { draft: 0, done: 0 };
    if (a.status === "draft") cur.draft += 1;
    else cur.done += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .slice(0, 6)
    .map(([label, v]) => ({ label, ...v }));
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, sub, accent, loading }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl p-5 flex flex-col gap-3 border transition-shadow hover:shadow-sm ${
        accent
          ? "bg-[#C62828] text-white border-transparent shadow-sm"
          : "bg-white border-gray-100"
      }`}
    >
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
          <p className={`text-xs mt-1 ${accent ? "text-red-100" : "text-gray-400"}`}>{sub}</p>
        )}
      </div>
    </div>
  );
}

function HeroChip({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
    >
      {label}
      <ChevronRight className="w-3 h-3 opacity-50" />
    </Link>
  );
}

function QuickActionGrid({ items }: { items: QuickActionProps[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map(({ label, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-gray-100 hover:border-red-100 hover:shadow-sm transition-all text-center"
        >
          <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center group-hover:bg-[#C62828] transition-colors">
            <Icon className="w-5 h-5 text-[#C62828] group-hover:text-white transition-colors" />
          </div>
          <span className="text-xs font-semibold text-gray-700 leading-tight">{label}</span>
        </Link>
      ))}
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
    <div className={`bg-white rounded-2xl border border-gray-100 p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function AttentionPanel({ items, emptyText }: { items: AttentionItem[]; emptyText: string }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
        <p className="text-sm text-gray-500">{emptyText}</p>
      </div>
    );
  }

  const icon = {
    warning: <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />,
    info: <Clock className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />,
  };

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
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
    </div>
  );
}

type FeedItem = {
  id: string;
  text: string;
  time: string;
  type: "success" | "warning" | "info";
};

const feedIcon = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />,
  warning: <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />,
  info: <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />,
};

function ActivityTimeline({ items }: { items: FeedItem[] }) {
  if (!items.length) {
    return <p className="text-sm text-gray-400 py-6 text-center">No recent activity</p>;
  }
  return (
    <div className="relative pl-4 border-l-2 border-gray-100 space-y-4 ml-1">
      {items.map((item) => (
        <div key={item.id} className="relative flex items-start gap-3 -ml-[21px]">
          <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center flex-shrink-0">
            {feedIcon[item.type]}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm text-gray-700 leading-snug">{item.text}</p>
            <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();

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
  const isAdmin =
    role === "admin" || role === "super_admin" || role === "manager";

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

  const firstName =
    profile?.first_name ?? session?.user?.email?.split("@")[0] ?? "there";

  const pendingLeave = leaveData?.filter((l) => l.status === "pending").length ?? 0;
  const approvedLeave = leaveData?.filter((l) => l.status === "approved").length ?? 0;
  const rejectedLeave = leaveData?.filter((l) => l.status === "rejected").length ?? 0;
  const pendingSupervisorReview =
    appraisalData?.filter((a) => a.supervisor_weighted_score === null).length ?? 0;
  const draftAppraisals = appraisalData?.filter((a) => a.status === "draft").length ?? 0;
  const avgScore = appraisalData?.length
    ? (
        appraisalData
          .filter((a) => a.employee_weighted_score)
          .reduce((sum, a) => sum + (a.employee_weighted_score ?? 0), 0) /
        (appraisalData.filter((a) => a.employee_weighted_score).length || 1)
      ).toFixed(2)
    : "—";

  const myLeave = leaveData ?? [];
  const myPendingLeave = myLeave.filter((l) => l.status === "pending").length;
  const myApprovedLeave = myLeave.filter((l) => l.status === "approved").length;
  const myRejectedLeave = myLeave.filter((l) => l.status === "rejected").length;
  const myAppraisals = appraisalData ?? [];
  const latestAppraisal = myAppraisals[0] ?? myAppraisals[myAppraisals.length - 1];
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

  const appraisalGroups = useMemo(
    () => groupAppraisalsByQuarter(appraisalData ?? []),
    [appraisalData],
  );

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

  const adminAttentionItems = useMemo((): AttentionItem[] => {
    const items: AttentionItem[] = [];
    leaveData
      ?.filter((l) => l.status === "pending")
      .slice(0, 3)
      .forEach((l) => {
        items.push({
          id: `leave-${l.id}`,
          title: `${leavePersonName(l)} — ${l.leave_type} leave`,
          subtitle: formatDateRange(l.start_date, l.end_date),
          href: "/dashboard/humanCapital/leave",
          type: "warning",
        });
      });
    appraisalData
      ?.filter((a) => a.status === "draft")
      .slice(0, 3)
      .forEach((a) => {
        items.push({
          id: `appraisal-${a.id}`,
          title: `${a.employee_name} — ${a.review_quarter} ${a.review_year}`,
          subtitle: "Appraisal draft in progress",
          href: "/dashboard/humanCapital/appraisal",
          type: "info",
        });
      });
    return items.slice(0, 5);
  }, [leaveData, appraisalData]);

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
          href: "/dashboard/humanCapital/leave",
          type: "warning",
        });
      });
    if (latestAppraisal?.status === "draft") {
      items.push({
        id: `appraisal-${latestAppraisal.id}`,
        title: `Complete ${latestAppraisal.review_quarter} ${latestAppraisal.review_year} appraisal`,
        subtitle: "Draft awaiting submission",
        href: "/dashboard/humanCapital/appraisal",
        type: "info",
      });
    }
    return items;
  }, [myLeave, latestAppraisal]);

  const buildAdminFeed = (): FeedItem[] => {
    const items: FeedItem[] = [];
    leaveData?.slice(0, 3).forEach((l) => {
      items.push({
        id: `leave-${l.id}`,
        text: `${leavePersonName(l)} — ${l.leave_type} leave is ${l.status}`,
        time: timeAgo(l.created_at),
        type: l.status === "pending" ? "warning" : l.status === "approved" ? "success" : "info",
      });
    });
    appraisalData?.slice(0, 3).forEach((a) => {
      items.push({
        id: `appraisal-${a.id}`,
        text: `${a.employee_name} — ${a.review_quarter} ${a.review_year} · score ${a.employee_weighted_score ?? "pending"}`,
        time: timeAgo(a.created_at),
        type: a.status === "draft" ? "warning" : "success",
      });
    });
    return items.slice(0, 6);
  };

  const buildEmployeeFeed = (): FeedItem[] => {
    const items: FeedItem[] = [];
    myLeave.slice(0, 2).forEach((l) => {
      items.push({
        id: `leave-${l.id}`,
        text: `Your ${l.leave_type} leave (${l.total_days} days) is ${l.status}`,
        time: timeAgo(l.created_at),
        type: l.status === "pending" ? "warning" : l.status === "approved" ? "success" : "info",
      });
    });
    myAppraisals.slice(0, 2).forEach((a) => {
      items.push({
        id: `appraisal-${a.id}`,
        text: `${a.review_quarter} ${a.review_year} appraisal — score ${a.employee_weighted_score ?? "pending"}`,
        time: timeAgo(a.created_at),
        type: a.status === "draft" ? "info" : "success",
      });
    });
    mySkillLogs.slice(0, 2).forEach((s) => {
      items.push({
        id: `skill-${s.id}`,
        text: "Skill log entry recorded",
        time: timeAgo(s.created_at),
        type: "success",
      });
    });
    return items.slice(0, 5);
  };

  const coreLoading = usersLoading || leaveLoading || appraisalLoading;
  if (coreLoading) {
    return <DashboardOverviewSkeleton />;
  }

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

  const adminQuickActions: QuickActionProps[] = [
    { label: "User Management", href: "/dashboard/access-control", icon: Users },
    { label: "Leave", href: "/dashboard/humanCapital/leave", icon: CalendarCheck },
    { label: "Appraisals", href: "/dashboard/humanCapital/appraisal", icon: Star },
    { label: "Skill Logs", href: "/dashboard/humanCapital/skillLog", icon: ClipboardList },
    { label: "SOPs", href: "/dashboard/sop", icon: ShieldCheck },
    { label: "Learning Hub", href: "/dashboard/lms", icon: BookOpen },
  ];

  const employeeQuickActions: QuickActionProps[] = [
    { label: "My Leave", href: "/dashboard/humanCapital/leave", icon: CalendarCheck },
    { label: "Appraisals", href: "/dashboard/humanCapital/appraisal", icon: Star },
    { label: "Skill Log", href: "/dashboard/humanCapital/skillLog", icon: ClipboardList },
    { label: "SOPs", href: "/dashboard/sop", icon: ShieldCheck },
    { label: "Learning Hub", href: "/dashboard/lms", icon: BookOpen },
    { label: "Calendar", href: "/dashboard/taskManager/calendar", icon: CalendarCheck },
  ];

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
                {greeting}, {firstName}
              </h1>
              <p className="text-sm text-gray-500 mt-1">{dateStr}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {isAdmin ? (
                  <>
                    <HeroChip
                      label={`${pendingLeave} leave pending`}
                      href="/dashboard/humanCapital/leave"
                    />
                    <HeroChip
                      label={`${draftAppraisals} appraisal drafts`}
                      href="/dashboard/humanCapital/appraisal"
                    />
                    <HeroChip
                      label={`${users?.length ?? 0} staff`}
                      href="/dashboard/access-control"
                    />
                  </>
                ) : (
                  <>
                    <HeroChip
                      label={`${myPendingLeave} leave pending`}
                      href="/dashboard/humanCapital/leave"
                    />
                    {latestAppraisal && (
                      <HeroChip
                        label={`Score ${latestAppraisal.employee_weighted_score ?? "—"}/4`}
                        href="/dashboard/humanCapital/appraisal"
                      />
                    )}
                    <HeroChip
                      label={`${mySkillLogs.length} skill logs`}
                      href="/dashboard/humanCapital/skillLog"
                    />
                  </>
                )}
              </div>
            </div>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-red-50 border border-red-100 text-xs font-semibold text-[#C62828] self-start capitalize">
              {role?.replace("_", " ") ?? "Employee"}
            </span>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              />
              <StatCard
                label="Appraisals"
                value={appraisalData?.length ?? "—"}
                icon={Star}
                sub={`${pendingSupervisorReview} awaiting review · avg ${avgScore}`}
              />
              <StatCard
                label="SOPs"
                value={sopData?.length ?? "—"}
                icon={FileText}
                sub="Active procedures"
                loading={sopLoading}
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
              />
              <StatCard
                label="Appraisals"
                value={myAppraisals.length}
                icon={Star}
                sub={
                  latestAppraisal
                    ? `Latest: ${latestAppraisal.review_quarter} ${latestAppraisal.review_year}`
                    : "None yet"
                }
              />
              <StatCard
                label="Skill Logs"
                value={mySkillLogs.length}
                icon={ClipboardList}
                sub="Entries recorded"
                loading={skillLogLoading}
              />
              <StatCard
                label="SOPs"
                value={sopData?.length ?? "—"}
                icon={FileText}
                sub="Available to you"
                loading={sopLoading}
              />
            </>
          )}
        </div>

        {/* Charts + attention */}
        {isAdmin ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Panel title="Leave requests" className="lg:col-span-1">
                <DonutChart
                  segments={leaveSegments}
                  centerLabel={String((leaveData?.length ?? 0))}
                  centerSub="total"
                />
              </Panel>
              <Panel title="Appraisal progress" className="lg:col-span-1">
                <AppraisalBarChart groups={appraisalGroups} />
              </Panel>
              <Panel
                title="Needs attention"
                action={
                  <Link
                    href="/dashboard/humanCapital/leave"
                    className="text-xs text-[#C62828] font-medium hover:underline"
                  >
                    View all
                  </Link>
                }
                className="lg:col-span-1"
              >
                <AttentionPanel
                  items={adminAttentionItems}
                  emptyText="All caught up — nothing needs attention"
                />
              </Panel>
            </div>

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

        {/* Quick actions */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 px-1">
            Quick actions
          </h3>
          <QuickActionGrid items={isAdmin ? adminQuickActions : employeeQuickActions} />
        </div>

        {/* Activity + appraisals table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Recent activity">
            <ActivityTimeline items={isAdmin ? buildAdminFeed() : buildEmployeeFeed()} />
          </Panel>

          {isAdmin && appraisalData && appraisalData.length > 0 && (
            <Panel
              title="Recent appraisals"
              action={
                <Link
                  href="/dashboard/humanCapital/appraisal"
                  className="text-xs text-[#C62828] font-medium hover:underline"
                >
                  View all
                </Link>
              }
            >
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                      <th className="text-left pb-3 font-semibold">Employee</th>
                      <th className="text-left pb-3 font-semibold">Period</th>
                      <th className="text-left pb-3 font-semibold">Score</th>
                      <th className="text-left pb-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {appraisalData.slice(0, 5).map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 font-medium text-gray-800">{a.employee_name}</td>
                        <td className="py-3 text-gray-500">
                          {a.review_quarter} {a.review_year}
                        </td>
                        <td className="py-3 font-semibold text-gray-800">
                          {a.employee_weighted_score ?? "—"}
                          <span className="text-gray-400 text-xs font-normal"> / 4</span>
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              a.status === "draft"
                                ? "bg-amber-50 text-amber-700"
                                : a.status === "submitted"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

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
      </div>
    </div>
  );
}
