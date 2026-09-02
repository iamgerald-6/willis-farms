"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  ClipboardList,
  Plus,
  ChevronRight,
  CheckCircle2,
  Clock,
  ChevronDown,
  User,
  Calendar,
  Award,
  Trash2,
  Lock,
  PenLine,
  Pencil,
  Eye,
} from "lucide-react";
import {
  getModuleRoute,
  getSkillLogStatusDef,
  getSkillLogStatusFilterOptions,
  SKILL_LOG_PAGE_COPY,
} from "@/lib/moduleRegistry";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import {
  canApproveSkillLogRecord,
  canEditSkillLogDraft,
  canFillSkillLog,
  type SkillLogRecord,
} from "@/lib/skillLogAccess";
import SkillLogDetailModal from "./component/SkillLogDetailModal";

const BRAND = "#C62828";
const BRAND_LIGHT = "#FFEBEE";
const SKILL_LOG_ROUTE =
  getModuleRoute("mod:skill-log") ?? "/dashboard/humanCapital/skillLog";
const SKILL_LOG_FORM_ROUTE = `${SKILL_LOG_ROUTE}/skillLogForms`;

const STATUS_ICONS = {
  draft: Clock,
  submitted: Clock,
  signed_off: CheckCircle2,
} as const;

interface SkillLogUser {
  user_id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
}

interface SkillLog {
  id: string;
  employee_id: string;
  // The API (get_skillLog/route.ts) never actually sends these flat fields —
  // only the joined employee/supervisor objects below. Kept optional here as
  // a legacy fallback for employeeName/supervisorName/grade lookups (see
  // those helpers above) rather than removed outright, in case some other
  // caller ever does send them.
  employee_name?: string;
  employee_grade?: string;
  log_type: string;
  supervisor_id: string;
  supervisor_name?: string;
  supervisor_grade?: string;
  review_period: string;
  status: "draft" | "submitted" | "signed_off";
  overall_rating: number | null;
  created_at: string;
  updated_at: string;
  // joined relations actually returned by the API
  employee?: SkillLogUser;
  supervisor?: SkillLogUser;
}

interface UserProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
  role?: string;
  company_id?: string;
}

const STATUS_CONFIG = {
  draft: {
    label: "Draft",
    color: "bg-gray-100 text-gray-600 border-gray-200",
    icon: Clock,
  },
  submitted: {
    label: "Submitted",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: Clock,
  },
  signed_off: {
    label: "Signed Off",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
};


function logAsRecord(log: SkillLog): SkillLogRecord {
  return {
    id: log.id,
    employee_id: log.employee_id,
    supervisor_id: log.supervisor_id,
    status: log.status,
    employee: log.employee,
    supervisor: log.supervisor,
  };
}
// The API only ever sends the joined employee/supervisor objects (see
// employee:users!... / supervisor:users!... in get_skillLog/route.ts) — it
// never actually populates the flat employee_name/supervisor_name/
// employee_grade fields the SkillLog type also declares. Reading those flat
// fields directly crashes anything that calls .toLowerCase() on them (they're
// always undefined), and silently shows blank names anywhere they're just
// displayed. These derive the real name from the joined object first, with
// the flat field kept only as a last-resort fallback (matches the pattern
// already used for supervisor_grade below).
function fullName(u?: SkillLogUser | null): string | undefined {
  if (!u) return undefined;
  const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  return name || undefined;
}
function employeeName(log: SkillLog): string {
  return fullName(log.employee) ?? log.employee_name ?? "Unknown";
}
function supervisorName(log: SkillLog): string {
  return fullName(log.supervisor) ?? log.supervisor_name ?? "Unknown";
}

// review_period is stored as a plain string (no schema change) but is now
// captured as a single YYYY-MM-DD date rather than free text or a quarter.
// Format it for display; older logs filled in before this change may still
// hold a legacy value (e.g. "Q1 2026") — those are shown as-is.
function formatReviewDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// NOTE: sign-off eligibility used to be computed locally here (canSignOff,
// using a gradeLevel() helper that turned out not to exist elsewhere in this
// file — dead code). It's now handled by canApproveSkillLogRecord from
// @/lib/skillLogAccess (see canApproveLog below), which is Gerald's
// permission-engine equivalent.

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p
        className="text-2xl md:text-3xl font-black"
        style={accent ? { color: BRAND } : { color: "#111827" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs text-gray-400 mt-1 hidden sm:block">{sub}</p>
      )}
    </div>
  );
}

function LogCard({
  log,
  onClick,
  onView,
  onDelete,
  onSignOff,
  canSignOffLog,
}: {
  log: SkillLog;
  onClick?: () => void;
  onView?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onSignOff?: (e: React.MouseEvent) => void;
  canSignOffLog?: boolean;
}) {
  const statusDef =
    getSkillLogStatusDef(log.status) ?? getSkillLogStatusDef("draft")!;
  const StatusIcon =
    STATUS_ICONS[log.status as keyof typeof STATUS_ICONS] ?? Clock;
  const isLocked = log.status === "submitted" || log.status === "signed_off";

  const cardContent = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div
          className={`hidden sm:flex w-10 h-10 rounded-xl items-center justify-center flex-shrink-0 mt-0.5 ${isLocked ? "opacity-50" : ""}`}
          style={{ background: BRAND_LIGHT }}
        >
          {isLocked ? (
            <Lock className="w-5 h-5" style={{ color: BRAND }} />
          ) : (
            <ClipboardList className="w-5 h-5" style={{ color: BRAND }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-bold truncate ${isLocked ? "text-gray-500" : "text-gray-900"}`}
          >
            {log.log_type}
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <User className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{employeeName(log)}</span>
            </span>
            <span className="hidden sm:block text-xs text-gray-300">·</span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Award className="w-3 h-3 flex-shrink-0" />
              {log.employee?.grade_level ?? log.employee_grade}
            </span>
            <span className="hidden sm:block text-xs text-gray-300">·</span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              {formatReviewDate(log.review_period)}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Filled by{" "}
            <span className="font-medium text-gray-600">
              {supervisorName(log)}
            </span>
          </p>
        </div>
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusDef.badgeClass}`}
        >
          <StatusIcon className="w-3 h-3" />
          <span className="hidden sm:inline">{statusDef.label}</span>
        </span>
        {log.overall_rating && (
          <span className="text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-lg">
            ★ {log.overall_rating}/5
          </span>
        )}
        <div className="flex items-center gap-2">
          {log.status === "draft" && (
            <>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition" />
              <button
                type="button"
                onClick={onDelete}
                className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {log.status === "submitted" && canSignOffLog && (
            <button
              type="button"
              onClick={onSignOff}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm hover:opacity-90 transition"
              style={{ background: BRAND }}
            >
              <PenLine className="w-3.5 h-3.5" />
              Sign Off
            </button>
          )}
          {log.status === "submitted" && !canSignOffLog && (
            <Lock className="w-4 h-4 text-gray-300" />
          )}
          {isLocked && onView && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onView();
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
            >
              <Eye className="w-3.5 h-3.5" />
              {SKILL_LOG_PAGE_COPY.viewButton}
            </button>
          )}
          {log.status === "signed_off" && (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          )}
        </div>
      </div>
    </div>
  );

  if (isLocked && onView) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onView}
        onKeyDown={(e) => e.key === "Enter" && onView()}
        className="w-full bg-white rounded-2xl border border-gray-200 p-4 md:p-5 text-left hover:shadow-md hover:border-gray-300 transition-all group cursor-pointer opacity-90"
      >
        {cardContent}
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="w-full bg-white rounded-2xl border border-gray-200 p-4 md:p-5 opacity-80">
        {cardContent}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      className="w-full bg-white rounded-2xl border border-gray-200 p-4 md:p-5 text-left hover:shadow-md hover:border-gray-300 transition-all group cursor-pointer"
    >
      {cardContent}
    </div>
  );
}

function SignOffModal({
  log,
  viewerName,
  onConfirm,
  onClose,
  isPending,
}: {
  log: SkillLog;
  viewerName: string;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-bold text-gray-900 mb-3">
          {SKILL_LOG_PAGE_COPY.signOffTitle}
        </h2>

        <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 italic">
          &quot;I,{" "}
          <span className="font-semibold not-italic">{viewerName}</span>, hereby
          agree to sign off the competency assessment for{" "}
          <span className="font-semibold not-italic">{employeeName(log)}</span>{" "}
          — {log.log_type} ({formatReviewDate(log.review_period)}).{" "}
          {log.overall_rating != null && (
            <>
              Overall supervisor rating:{" "}
              <span className="font-semibold not-italic">
                {log.overall_rating}/5
              </span>
              .
            </>
          )}
          &quot;
        </p>

        <label className="flex items-start gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded accent-red-700 flex-shrink-0"
          />
          <span className="text-sm text-gray-700">
            {SKILL_LOG_PAGE_COPY.signOffConfirmLabel}
          </span>
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!agreed || isPending}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-40"
            style={{ background: BRAND }}
          >
            {isPending ? "Signing off…" : "Sign Off"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SkillLogsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterLogType, setFilterLogType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [signOffLog, setSignOffLog] = useState<SkillLog | null>(null);
  const [viewLogId, setViewLogId] = useState<string | null>(null);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });
  const userId = session?.user?.id ?? "";
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;

  const { data: allUsers = [] } = useQuery<UserProfile[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data as UserProfile[];
    },
  });

  const currentUser = allUsers.find((u) => u.user_id === userId) ?? null;
  const accessProfile = resolveAccessProfile(currentUser, sessionRole);
  const { data: groupPresetData } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;

  const canFill = accessProfile
    ? canFillSkillLog(accessProfile, groupPresets, sessionRole)
    : false;
  const canReview = accessProfile
    ? canPerformModuleAction(
        accessProfile,
        "hc:skillLog",
        "review",
        sessionRole,
        groupPresets,
      )
    : false;
  const canApprove = accessProfile
    ? canPerformModuleAction(
        accessProfile,
        "hc:skillLog",
        "approve",
        sessionRole,
        groupPresets,
      )
    : false;

  const canApproveLog = (log: SkillLog) =>
    accessProfile
      ? canApproveSkillLogRecord(
          accessProfile,
          userId,
          logAsRecord(log),
          groupPresets,
          sessionRole,
        )
      : false;

  const canEditLog = (log: SkillLog) =>
    accessProfile
      ? canEditSkillLogDraft(
          accessProfile,
          userId,
          logAsRecord(log),
          groupPresets,
          sessionRole,
        )
      : false;

  const viewerFullName = currentUser
    ? `${currentUser.first_name} ${currentUser.last_name}`
    : "You";

  const { data: logs = [], isLoading } = useQuery<SkillLog[]>({
    queryKey: ["skill_logs", userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await api.get("/skillLog/get_skillLog");
      return res.data.data as SkillLog[];
    },
  });

  const { mutate: deleteLog } = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/skillLog/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill_logs", userId] });
      toast.success("Skill log deleted.");
    },
    onError: () => {
      toast.error("Failed to delete skill log.");
    },
  });

  const getAuthHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const { mutate: submitSignOff, isPending: isSigningOff } = useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await api.patch(
        `/skillLog/${id}`,
        {
          status: "signed_off",
          signed_off_by: userId,
          signed_off_at: new Date().toISOString(),
        },
        { headers },
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill_logs", userId] });
      setSignOffLog(null);
      toast.success("Skill log signed off.");
    },
    onError: () => {
      toast.error("Failed to sign off.");
    },
  });

  const visibleLogs = logs;

  // Dropdown options are built from the logs actually on screen, rather than
  // a fixed/imported list — every option shown is guaranteed to match at
  // least one visible log, and it stays in sync automatically as new log
  // types or employees show up.
  const employeeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    visibleLogs.forEach((l) => {
      const id = l.employee?.user_id ?? l.employee_id;
      if (id) byId.set(id, employeeName(l));
    });
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [visibleLogs]);

  const logTypeOptions = useMemo(() => {
    const types = new Set(visibleLogs.map((l) => l.log_type).filter(Boolean));
    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [visibleLogs]);

  const filtered = useMemo(() => {
    return visibleLogs.filter((l) => {
      const empId = l.employee?.user_id ?? l.employee_id;
      const matchEmployee =
        filterEmployee === "all" || empId === filterEmployee;
      const matchLogType =
        filterLogType === "all" || l.log_type === filterLogType;
      const matchStatus = filterStatus === "all" || l.status === filterStatus;
      return matchEmployee && matchLogType && matchStatus;
    });
  }, [visibleLogs, filterEmployee, filterLogType, filterStatus]);

  const stats = useMemo(
    () => ({
      total: visibleLogs.length,
      signedOff: visibleLogs.filter((l) => l.status === "signed_off").length,
      pending: visibleLogs.filter((l) => l.status === "submitted").length,
      drafts: visibleLogs.filter((l) => l.status === "draft").length,
    }),
    [visibleLogs],
  );

  return (
    <div className="p-4 md:p-6 min-h-full bg-gray-50">
      {viewLogId && (
        <SkillLogDetailModal
          logId={viewLogId}
          onClose={() => setViewLogId(null)}
        />
      )}
      {signOffLog && (
        <SignOffModal
          log={signOffLog}
          viewerName={viewerFullName}
          isPending={isSigningOff}
          onConfirm={() => submitSignOff(signOffLog.id)}
          onClose={() => setSignOffLog(null)}
        />
      )}
      {/* ── Header ── */}
      <div className="flex items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">
            {SKILL_LOG_PAGE_COPY.title}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {canFill
              ? SKILL_LOG_PAGE_COPY.subtitleCanAct
              : canReview || canApprove
                ? SKILL_LOG_PAGE_COPY.subtitleSeeAll
                : SKILL_LOG_PAGE_COPY.subtitleSelf}
          </p>
        </div>
        {canFill && (
          <button
            onClick={() => router.push(SKILL_LOG_FORM_ROUTE)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 transition flex-shrink-0"
            style={{ background: BRAND }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">
              {SKILL_LOG_PAGE_COPY.fillButton}
            </span>
            <span className="sm:hidden">{SKILL_LOG_PAGE_COPY.fillButtonShort}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatCard label="Total" value={stats.total} sub="all time" />
        <StatCard
          label="Signed Off"
          value={stats.signedOff}
          sub="completed"
          accent
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          sub="awaiting sign-off"
        />
        <StatCard label="Drafts" value={stats.drafts} sub="in progress" />
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="relative w-full sm:w-56">
          <select
            aria-label="Filter by employee"
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
            className="w-full appearance-none pl-9 pr-8 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ "--tw-ring-color": BRAND } as any}
          >
            <option value="all">All employees</option>
            {employeeOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative w-full sm:w-56">
          <select
            aria-label="Filter by log type"
            value={filterLogType}
            onChange={(e) => setFilterLogType(e.target.value)}
            className="w-full appearance-none pl-9 pr-8 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ "--tw-ring-color": BRAND } as any}
          >
            <option value="all">All log types</option>
            {logTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <ClipboardList className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto">
          {getSkillLogStatusFilterOptions().map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
              style={
                filterStatus === key
                  ? { background: BRAND, color: "#fff" }
                  : { color: "#6b7280" }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Log list ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse h-24"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 md:p-12 text-center">
          <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500">
            {SKILL_LOG_PAGE_COPY.emptyTitle}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {canFill
              ? SKILL_LOG_PAGE_COPY.emptyCanAct
              : SKILL_LOG_PAGE_COPY.emptySelf}
          </p>
          {canFill && (
            <button
              onClick={() =>
                router.push(SKILL_LOG_FORM_ROUTE)
              }
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: BRAND }}
            >
              <Plus className="w-4 h-4" /> {SKILL_LOG_PAGE_COPY.fillFirstLog}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((log) => (
              <div key={log.id}>
                {confirmDeleteId === log.id ? (
                  <div className="bg-white rounded-2xl border border-red-200 p-4 flex items-center justify-between gap-4">
                    <p className="text-sm text-gray-700">
                      Delete{" "}
                      <span className="font-semibold">{log.log_type}</span> for{" "}
                      <span className="font-semibold">
                        {employeeName(log)}
                      </span>
                      ?
                    </p>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          deleteLog(log.id);
                          setConfirmDeleteId(null);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <LogCard
                    log={log}
                    onClick={
                      log.status === "draft" && canEditLog(log)
                        ? () =>
                            router.push(
                              `${SKILL_LOG_FORM_ROUTE}?edit=${log.id}`,
                            )
                        : undefined
                    }
                    onView={
                      log.status === "submitted" || log.status === "signed_off"
                        ? () => setViewLogId(log.id)
                        : undefined
                    }
                    onDelete={
                      canEditLog(log)
                        ? (e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(log.id);
                          }
                        : undefined
                    }
                    onSignOff={
                      canApproveLog(log)
                        ? (e) => {
                            e.stopPropagation();
                            setSignOffLog(log);
                          }
                        : undefined
                    }
                    canSignOffLog={canApproveLog(log)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Employee
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Log Type
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Date
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Filled By
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Rating
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Status
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const status = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.draft;
                  const StatusIcon = status.icon;
                  const canEditDraft = canEditLog(log);
                  const canDeleteDraft = canEditDraft;
                  const canSignOffThis = canApproveLog(log);
                  const canViewLocked =
                    log.status === "submitted" || log.status === "signed_off";

                  if (confirmDeleteId === log.id) {
                    return (
                      <tr key={log.id} className="border-b border-gray-100">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm text-gray-700">
                              Delete{" "}
                              <span className="font-semibold">
                                {log.log_type}
                              </span>{" "}
                              for{" "}
                              <span className="font-semibold">
                                {employeeName(log)}
                              </span>
                              ?
                            </p>
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  deleteLog(log.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={log.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {employeeName(log)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {log.employee?.grade_level ?? log.employee_grade}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {log.log_type}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatReviewDate(log.review_period)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {supervisorName(log)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {log.overall_rating ? `★ ${log.overall_rating}/5` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canViewLocked && (
                            <button
                              onClick={() => setViewLogId(log.id)}
                              title="View"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {SKILL_LOG_PAGE_COPY.viewButton}
                            </button>
                          )}
                          {canEditDraft && (
                            <button
                              onClick={() =>
                                router.push(
                                  `${SKILL_LOG_FORM_ROUTE}?edit=${log.id}`,
                                )
                              }
                              title="Edit"
                              className="p-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDeleteDraft && (
                            <button
                              onClick={() => setConfirmDeleteId(log.id)}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {log.status === "submitted" && canSignOffThis && (
                            <button
                              onClick={() => setSignOffLog(log)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm hover:opacity-90 transition"
                              style={{ background: BRAND }}
                            >
                              <PenLine className="w-3.5 h-3.5" />
                              Sign Off
                            </button>
                          )}
                          {log.status === "submitted" && !canSignOffThis && (
                            <Lock className="w-4 h-4 text-gray-300" />
                          )}
                          {log.status === "signed_off" && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
