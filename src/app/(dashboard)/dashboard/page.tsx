"use client";

import { useRouter } from "next/navigation";
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
  ArrowUpRight,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type StatCardProps = {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
  accent?: boolean;
  loading?: boolean;
};

type QuickLinkProps = {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
};

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
};

type AppraisalRecord = {
  id: number;
  employee_name: string;
  review_quarter: string;
  review_year: number;
  status: "draft" | "submitted" | "completed";
  employee_weighted_score: number | null; // 👈 number, not string
  supervisor_weighted_score: number | null; // 👈 number, not string
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  sub,
  accent,
  loading,
}: StatCardProps) {
  return (
    <div
      className={`rounded-2xl p-5 flex flex-col gap-4 border transition-shadow hover:shadow-md ${
        accent
          ? "bg-[#C62828] text-white border-transparent"
          : "bg-white border-gray-100"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-semibold uppercase tracking-widest ${accent ? "text-red-200" : "text-gray-400"}`}
        >
          {label}
        </span>
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent ? "bg-white/20" : "bg-red-50"}`}
        >
          <Icon
            className={`w-4 h-4 ${accent ? "text-white" : "text-[#C62828]"}`}
          />
        </div>
      </div>
      <div>
        {loading ? (
          <div className="h-8 w-16 rounded-lg bg-gray-100 animate-pulse" />
        ) : (
          <p
            className={`text-3xl font-bold tracking-tight ${accent ? "text-white" : "text-gray-900"}`}
          >
            {value}
          </p>
        )}
        {sub && (
          <p
            className={`text-xs mt-1 flex items-center gap-1 ${accent ? "text-red-200" : "text-gray-400"}`}
          >
            <TrendingUp className="w-3 h-3" />
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function QuickLink({ label, description, href, icon: Icon }: QuickLinkProps) {
  return (
    <a
      href={href}
      className="group flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 hover:border-red-100 hover:shadow-md transition-all"
    >
      <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0 group-hover:bg-[#C62828] transition-colors">
        <Icon className="w-4 h-4 text-[#C62828] group-hover:text-white transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 truncate">{description}</p>
      </div>
      <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-[#C62828] transition-colors flex-shrink-0" />
    </a>
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

function ActivityFeed({ items }: { items: FeedItem[] }) {
  if (!items.length) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        No recent activity
      </p>
    );
  }
  return (
    <div className="space-y-0">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0"
        >
          <div className="mt-0.5">{feedIcon[item.type]}</div>
          <div className="flex-1 min-w-0">
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

  // Auth
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.push("/login");
      return data.session;
    },
  });

  // Users (admin: all staff)
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => (await api.get("/get_user")).data,
    enabled: !!session,
  });

  // Leave
  const { data: leaveData, isLoading: leaveLoading } = useQuery<LeaveRecord[]>({
    queryKey: ["leave"],
    queryFn: async () => {
      const res = await api.get("/leave/all");
      return Array.isArray(res.data) ? res.data : (res.data.data ?? []);
    },
    enabled: !!session,
  });

  // Appraisal
  const { data: appraisalData, isLoading: appraisalLoading } = useQuery<
    AppraisalRecord[]
  >({
    queryKey: ["appraisal"],
    queryFn: async () => {
      const res = await api.get("/appraisal/get_appraisal");
      console.log(res.data);
      return res.data.data;
    },
    enabled: !!session,
  });

  // Skill logs
  const { data: skillLogData, isLoading: skillLogLoading } = useQuery<
    SkillLogRecord[]
  >({
    queryKey: ["skillLog"],
    queryFn: async () => {
      const res = await api.get("/skillLog/get_skillLog");
      return res.data.data;
    },
    enabled: !!session,
  });

  // SOPs
  const { data: sopData, isLoading: sopLoading } = useQuery<SopRecord[]>({
    queryKey: ["sop"],
    queryFn: async () => (await api.get("/sop/get_content")).data,
    enabled: !!session,
  });

  // ── Derived identity ─────────────────────────────────────────────────────
  const userId = session?.user?.id;
  const profile = users?.find((u) => u.user_id === userId);
  const role = profile?.role ?? session?.user?.user_metadata?.role;
  const isAdmin =
    role === "admin" || role === "super_admin" || role === "manager";
  const firstName =
    profile?.first_name ?? session?.user?.email?.split("@")[0] ?? "there";

  // ── Admin derived metrics ────────────────────────────────────────────────
  const pendingLeave =
    leaveData?.filter((l) => l.status === "pending").length ?? 0;
  const approvedLeave =
    leaveData?.filter((l) => l.status === "approved").length ?? 0;
  const pendingSupervisorReview =
    appraisalData?.filter((a) => a.supervisor_weighted_score === null).length ??
    0;
  const avgScore = appraisalData?.length
    ? (
        appraisalData
          .filter((a) => a.employee_weighted_score)
          .reduce((sum, a) => sum + (a.employee_weighted_score ?? 0), 0) /
        (appraisalData.filter((a) => a.employee_weighted_score).length || 1)
      ).toFixed(2)
    : "—";

  // ── Employee derived metrics ─────────────────────────────────────────────
  const myLeave = leaveData ?? [];
  const myPendingLeave = myLeave.filter((l) => l.status === "pending").length;
  const myApprovedLeave = myLeave.filter((l) => l.status === "approved").length;
  const myAppraisals = appraisalData ?? [];
  const latestAppraisal = myAppraisals[myAppraisals.length - 1];
  const mySkillLogs = skillLogData ?? [];

  // ── Activity feed built from real data ──────────────────────────────────
  const buildAdminFeed = (): FeedItem[] => {
    const items: FeedItem[] = [];
    leaveData?.slice(0, 3).forEach((l) => {
      items.push({
        id: `leave-${l.id}`,
        text: `Leave request (${l.leave_type}) is ${l.status}`,
        time: timeAgo(l.created_at),
        type:
          l.status === "pending"
            ? "warning"
            : l.status === "approved"
              ? "success"
              : "info",
      });
    });
    appraisalData?.slice(0, 2).forEach((a) => {
      items.push({
        id: `appraisal-${a.id}`,
        text: `${a.employee_name} submitted ${a.review_quarter} ${a.review_year} appraisal — score ${a.employee_weighted_score ?? "pending"}`,
        time: timeAgo(a.created_at),
        type: a.status === "draft" ? "warning" : "success",
      });
    });
    return items.sort((a, b) => (a.time > b.time ? 1 : -1)).slice(0, 6);
  };

  const buildEmployeeFeed = (): FeedItem[] => {
    const items: FeedItem[] = [];
    myLeave.slice(0, 2).forEach((l) => {
      items.push({
        id: `leave-${l.id}`,
        text: `Your ${l.leave_type} leave (${l.total_days} days) is ${l.status}`,
        time: timeAgo(l.created_at),
        type:
          l.status === "pending"
            ? "warning"
            : l.status === "approved"
              ? "success"
              : "info",
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

  // ── Loading state ────────────────────────────────────────────────────────
  const coreLoading = usersLoading || leaveLoading || appraisalLoading;
  if (coreLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#C62828] border-t-transparent animate-spin" />
          <p className="text-sm text-gray-400">Loading your dashboard…</p>
        </div>
      </div>
    );
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

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {greeting}, {firstName}
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">{dateStr}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-100 text-xs font-semibold text-[#C62828] self-start sm:self-auto capitalize">
          {role?.replace("_", " ") ?? "Employee"}
        </span>
      </div>

      {/* ══════════════════ ADMIN VIEW ══════════════════ */}
      {isAdmin && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              accent
              label="Total Staff"
              value={users?.length ?? "—"}
              icon={Users}
              sub={`${users?.filter((u) => u.role === "employee").length ?? 0} employees`}
              loading={usersLoading}
            />
            <StatCard
              label="Pending Leave"
              value={pendingLeave}
              icon={CalendarCheck}
              sub={`${approvedLeave} approved`}
              loading={leaveLoading}
            />
            <StatCard
              label="Appraisals"
              value={appraisalData?.length ?? "—"}
              icon={Star}
              sub={`${pendingSupervisorReview} drafts · avg ${avgScore}`}
              loading={appraisalLoading}
            />
            <StatCard
              label="SOPs"
              value={sopData?.length ?? "—"}
              icon={FileText}
              sub="Active procedures"
              loading={sopLoading}
            />
          </div>

          {/* Quick links + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">
                Quick Access
              </h3>
              <QuickLink
                label="Manage Users"
                description="View, add and edit staff accounts"
                href="/dashboard/users"
                icon={Users}
              />
              <QuickLink
                label="Leave Requests"
                description={`${pendingLeave} pending approval`}
                href="/dashboard/humanCapital/leave"
                icon={CalendarCheck}
              />
              <QuickLink
                label="Appraisals"
                description={`${pendingSupervisorReview} drafts open`}
                href="/dashboard/humanCapital/appraisal"
                icon={Star}
              />
              <QuickLink
                label="Skill Logs"
                description="Review team skill progress"
                href="/dashboard/humanCapital/skillLog"
                icon={ClipboardList}
              />
              <QuickLink
                label="SOPs"
                description="Standard operating procedures"
                href="/dashboard/sop"
                icon={ShieldCheck}
              />
              <QuickLink
                label="Learning Hub"
                description="Training & development"
                href="/dashboard/lms"
                icon={BookOpen}
              />
            </div>

            {/* Activity feed */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-gray-800">
                  Recent Activity
                </h3>
                <a
                  href="/dashboard/humanCapital/leave"
                  className="text-xs text-[#C62828] font-medium hover:underline"
                >
                  View all
                </a>
              </div>
              <ActivityFeed items={buildAdminFeed()} />
            </div>
          </div>

          {/* Staff breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              Staff Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: "Super Admins",
                  count:
                    users?.filter((u) => u.role === "super_admin").length ?? 0,
                },
                {
                  label: "Admins",
                  count: users?.filter((u) => u.role === "admin").length ?? 0,
                },
                {
                  label: "Employees",
                  count:
                    users?.filter((u) => u.role === "employee").length ?? 0,
                },
                { label: "Total Staff", count: users?.length ?? 0 },
              ].map(({ label, count }) => (
                <div
                  key={label}
                  className="rounded-xl bg-gray-50 px-4 py-3 border border-gray-100"
                >
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Appraisal table */}
          {appraisalData && appraisalData.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">
                  Recent Appraisals
                </h3>
                <a
                  href="/dashboard/humanCapital/appraisal"
                  className="text-xs text-[#C62828] font-medium hover:underline"
                >
                  View all
                </a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                      <th className="text-left pb-3 font-semibold">Employee</th>
                      <th className="text-left pb-3 font-semibold">Period</th>
                      <th className="text-left pb-3 font-semibold">Score</th>
                      <th className="text-left pb-3 font-semibold">
                        Readiness
                      </th>
                      <th className="text-left pb-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {appraisalData.slice(0, 5).map((a) => (
                      <tr
                        key={a.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-3 font-medium text-gray-800">
                          {a.employee_name}
                        </td>
                        <td className="py-3 text-gray-500">
                          {a.review_quarter} {a.review_year}
                        </td>
                        <td className="py-3">
                          <span className="font-semibold text-gray-800">
                            {a.employee_weighted_score ?? "—"}
                          </span>
                          <span className="text-gray-400 text-xs"> / 4</span>
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              a.promotion_readiness === "ready_for_assessment"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {a.promotion_readiness?.replace(/_/g, " ") ?? "—"}
                          </span>
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
            </div>
          )}
        </>
      )}

      {/* ══════════════════ EMPLOYEE VIEW ══════════════════ */}
      {!isAdmin && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              accent
              label="Leave Pending"
              value={myPendingLeave}
              icon={CalendarCheck}
              sub={`${myApprovedLeave} approved`}
              loading={leaveLoading}
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
              loading={appraisalLoading}
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
          </div>

          {/* Latest appraisal score card */}
          {latestAppraisal && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
                  Latest Appraisal
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {latestAppraisal.review_quarter} {latestAppraisal.review_year}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  Supervisor:{" "}
                  {latestAppraisal.reviewing_manager ?? "Not yet assigned"}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-[#C62828]">
                    {latestAppraisal.employee_weighted_score ?? "—"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Your score / 4</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-300">
                    {latestAppraisal.supervisor_weighted_score ?? "—"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Supervisor score
                  </p>
                </div>
                <span
                  className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                    latestAppraisal.status === "draft"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {latestAppraisal.status}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1">
                Quick Access
              </h3>
              <QuickLink
                label="My Leave"
                description="Apply or check leave status"
                href="/dashboard/humanCapital/leave"
                icon={CalendarCheck}
              />
              <QuickLink
                label="My Appraisals"
                description="View your performance reviews"
                href="/dashboard/humanCapital/appraisal"
                icon={Star}
              />
              <QuickLink
                label="Skill Log"
                description="Log your recent skill updates"
                href="/dashboard/humanCapital/skillLog"
                icon={ClipboardList}
              />
              <QuickLink
                label="SOPs"
                description="Standard operating procedures"
                href="/dashboard/sop"
                icon={ShieldCheck}
              />
              <QuickLink
                label="Learning Hub"
                description="Continue your training"
                href="/dashboard/lms"
                icon={BookOpen}
              />
            </div>

            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-gray-800">
                  Recent Activity
                </h3>
              </div>
              <ActivityFeed items={buildEmployeeFeed()} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
