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
  Search,
  User,
  Calendar,
  Award,
  Trash2,
  Lock,
  PenLine,
} from "lucide-react";
import { canSignOffSkillLog } from "@/lib/accessControl";
import {
  getModuleRoute,
  getSkillLogStatusDef,
  getSkillLogStatusFilterOptions,
  parseSkillLogGradeLevel,
  SKILL_LOG_MIN_FILLER_GRADE,
  SKILL_LOG_PAGE_COPY,
} from "@/lib/moduleRegistry";

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
  employee_name: string;
  employee_grade: string;
  log_type: string;
  supervisor_id: string;
  supervisor_name: string;
  supervisor_grade?: string;
  review_period: string;
  status: "draft" | "submitted" | "signed_off";
  overall_rating: number | null;
  created_at: string;
  updated_at: string;
  // joined relations returned by the API
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
  onDelete,
  onSignOff,
  canSignOffLog,
}: {
  log: SkillLog;
  onClick?: () => void;
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
              <span className="truncate">{log.employee_name}</span>
            </span>
            <span className="hidden sm:block text-xs text-gray-300">·</span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Award className="w-3 h-3 flex-shrink-0" />
              {log.employee_grade}
            </span>
            <span className="hidden sm:block text-xs text-gray-300">·</span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              {log.review_period}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Filled by{" "}
            <span className="font-medium text-gray-600">
              {log.supervisor_name}
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
          {log.status === "signed_off" && (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          )}
        </div>
      </div>
    </div>
  );

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
          <span className="font-semibold not-italic">{log.employee_name}</span>{" "}
          — {log.log_type} ({log.review_period}).{" "}
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
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [signOffLog, setSignOffLog] = useState<SkillLog | null>(null);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });
  const userId = session?.user?.id ?? "";

  const { data: allUsers = [] } = useQuery<UserProfile[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data as UserProfile[];
    },
  });

  const currentUser = allUsers.find((u) => u.user_id === userId) ?? null;
  const userGradeLevel = parseSkillLogGradeLevel(currentUser?.grade_level);
  const viewerRole = currentUser?.role ?? "";

  // Supervisor = L4+ (grade determines this, not role)
  const canFill = userGradeLevel >= SKILL_LOG_MIN_FILLER_GRADE;

  // Can the viewer see ALL logs (even ones they didn't create/own)?
  const seeAll =
    viewerRole === "super_admin" ||
    viewerRole === "admin" ||
    viewerRole === "manager" ||
    canFill;

  // Can the viewer take actions (sign off, edit, delete) on others' logs?
  const canAct = viewerRole === "super_admin" || canFill;

  const viewerFullName = currentUser
    ? `${currentUser.first_name} ${currentUser.last_name}`
    : "You";

  const { data: logs = [], isLoading } = useQuery<SkillLog[]>({
    queryKey: ["skill_logs", userId, seeAll, canFill],
    enabled: !!userId,
    queryFn: async () => {
      const params = new URLSearchParams({
        userId,
        isSupervisor: String(canFill),
        fetchAll: String(seeAll),
      });
      const res = await api.get(`/skillLog/get_skillLog?${params}`);
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

  const visibleLogs = useMemo(() => {
    // API already returns the correct set; frontend filter is a safety net
    if (seeAll) return logs;
    return logs.filter((l) => {
      const empId = l.employee?.user_id ?? l.employee_id;
      return empId === userId;
    });
  }, [logs, userId, seeAll]);

  const filtered = useMemo(() => {
    return visibleLogs.filter((l) => {
      const matchSearch =
        !search ||
        l.employee_name.toLowerCase().includes(search.toLowerCase()) ||
        l.log_type.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === "all" || l.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [visibleLogs, search, filterStatus]);

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
            {canAct
              ? SKILL_LOG_PAGE_COPY.subtitleCanAct
              : seeAll
                ? SKILL_LOG_PAGE_COPY.subtitleSeeAll
                : SKILL_LOG_PAGE_COPY.subtitleSelf}
          </p>
        </div>
        {canAct && (
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

      {/* ── Stats ── */}
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
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={SKILL_LOG_PAGE_COPY.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ "--tw-ring-color": BRAND } as any}
          />
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
            {canAct
              ? SKILL_LOG_PAGE_COPY.emptyCanAct
              : SKILL_LOG_PAGE_COPY.emptySelf}
          </p>
          {canAct && (
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
        <div className="space-y-3">
          {filtered.map((log) => (
            <div key={log.id}>
              {confirmDeleteId === log.id ? (
                <div className="bg-white rounded-2xl border border-red-200 p-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-gray-700">
                    Delete <span className="font-semibold">{log.log_type}</span>{" "}
                    for{" "}
                    <span className="font-semibold">{log.employee_name}</span>?
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
                    log.status === "draft" &&
                    canAct &&
                    (log.supervisor?.user_id ?? log.supervisor_id) === userId
                      ? () =>
                          router.push(
                            `${SKILL_LOG_FORM_ROUTE}?edit=${log.id}`,
                          )
                      : undefined
                  }
                  onDelete={
                    log.status === "draft" &&
                    canAct &&
                    (log.supervisor?.user_id ?? log.supervisor_id) === userId
                      ? (e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(log.id);
                        }
                      : undefined
                  }
                  onSignOff={
                    canAct &&
                    (log.supervisor?.user_id ?? log.supervisor_id) !== userId
                      ? (e) => {
                          e.stopPropagation();
                          setSignOffLog(log);
                        }
                      : undefined
                  }
                  canSignOffLog={
                    canAct &&
                    (log.supervisor?.user_id ?? log.supervisor_id) !== userId &&
                    canSignOffSkillLog(
                      currentUser?.grade_level,
                      log.supervisor?.grade_level ?? log.supervisor_grade,
                    )
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
