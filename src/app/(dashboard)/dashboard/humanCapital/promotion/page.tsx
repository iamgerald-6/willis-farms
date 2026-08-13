"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Search, ChevronRight, Award, TrendingUp, Clock, User, Plus } from "lucide-react";
import api from "@/lib/api";
import {
  canActOnOthers as canActOnOthersAccess,
  canViewOthers,
} from "@/lib/accessControl";
import PromotionFormPage from "./component/promotionForm";
import { PromotionFormSections } from "./component/PromotionDetailSections";
import type { PromotionFormData } from "./component/promotionFormConfigs";
import { ListRowsSkeleton } from "@/components/skeletons/PageSkeletons";
import {
  GENERAL_PROMOTION_CONDITIONS,
  PROMOTION_DECISIONS,
  PROMOTION_PAGE_COPY,
  getPromotionDecisionDef,
  getPromotionMatrixStep,
  resolveNavIcon,
} from "@/lib/moduleRegistry";

// ─── Types ────────────────────────────────────────────────────────────────────

// A completed promotion assessment (from promotions table)
interface CompletedPromotion {
  type: "completed";
  id: number;
  created_at: string;
  appraisal_id: number;
  employee_company_id: string;
  employee_name: string;
  current_grade: string;
  current_job_title: string;
  proposed_grade: string;
  proposed_job_title: string;
  immediate_supervisor: string;
  reviewing_manager: string;
  triggering_review: string;
  tier_authorisation?: string;
  section_unit?: string;
  eligibility_checklist: Record<string, { answer: string; comment: string }>;
  assessment_ratings: Record<string, { rating: number; comment: string }>;
  promotion_step?: string | null;
  time_in_current_role?: string | null;
  business_need_confirmed?: boolean | null;
  form_data?: PromotionFormData | null;
  final_decision: string;
  decision_comments?: string;
  conditions?: string;
  submitted_by_grade: string;
  submitted_by_name?: string | null;
}

// A pending promotion (from appraisals table — flagged ready but not yet assessed)
interface PendingPromotion {
  type: "pending";
  id: number;
  created_at: string;
  company_id: string;
  employee_name: string;
  current_grade: string;
  promotion_readiness: string;
  submitted_by: string;
}

type PromotionItem = CompletedPromotion | PendingPromotion;

// ─── Promotion Matrix ─────────────────────────────────────────────────────────
// PROMOTION_MATRIX, GENERAL_PROMOTION_CONDITIONS, and decision badge styling
// live in the module registry taxonomy (src/lib/moduleRegistry/taxonomy/promotion.ts).

function decisionBadge(value: string) {
  const def = getPromotionDecisionDef(value);
  if (!def) return null;
  const Icon = resolveNavIcon(def.iconKey);
  return { label: def.label, color: def.badgeClass, icon: <Icon className="w-4 h-4" /> };
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function avgAssessmentRating(promotion: CompletedPromotion): string | null {
  const evidence =
    promotion.form_data?.documented_evidence ?? promotion.assessment_ratings;
  const vals = Object.values(evidence)
    .map((v) => v.rating)
    .filter((r): r is number => typeof r === "number");
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
}

// ─── Promotion Card ───────────────────────────────────────────────────────────
function PromotionCard({
  item,
  onClick,
  selected,
}: {
  item: PromotionItem;
  onClick: () => void;
  selected: boolean;
}) {
  if (item.type === "pending") {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${selected ? "border-[#1e3a5f] bg-blue-50/40" : "border-amber-100 bg-amber-50/30 hover:border-amber-300"}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {item.employee_name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {item.current_grade} · {formatDate(item.created_at)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-200 self-start sm:self-auto shrink-0">
            <Clock className="w-3 h-3" /> Awaiting Assessment
          </span>
        </div>
      </button>
    );
  }

  const decision = decisionBadge(item.final_decision);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${selected ? "border-[#1e3a5f] bg-blue-50/40" : "border-gray-100 bg-white hover:border-gray-300"}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {item.employee_name}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {item.current_grade} → {item.proposed_grade} ·{" "}
            {formatDate(item.created_at)}
          </p>
        </div>
        {decision && (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border self-start sm:self-auto shrink-0 ${decision.color}`}
          >
            {decision.icon}
            {decision.label}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Completed Promotion Detail ───────────────────────────────────────────────
function PromotionDetail({ promotion }: { promotion: CompletedPromotion }) {
  const decision = decisionBadge(promotion.final_decision);
  const matrixStep = getPromotionMatrixStep(
    promotion.current_grade,
    promotion.proposed_grade,
  );

  const avgRating = useMemo(() => {
    const evidence =
      promotion.form_data?.documented_evidence ?? promotion.assessment_ratings;
    const vals: number[] = [];
    for (const v of Object.values(evidence)) {
      if (typeof v.rating === "number") vals.push(v.rating);
    }
    if (!vals.length) return null;
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
  }, [promotion.form_data, promotion.assessment_ratings]);

  const totalWeighted = promotion.form_data?.readiness_summary?.total_weighted;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="bg-[#1e3a5f] rounded-2xl p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">
              {promotion.promotion_step
                ? promotion.promotion_step.replace("_", " → ")
                : "Promotion Assessment"}{" "}
              · {formatDate(promotion.created_at)}
            </p>
            <h2 className="text-xl sm:text-2xl font-bold truncate">
              {promotion.employee_name}
            </h2>
            <p className="text-white/60 text-xs sm:text-sm mt-0.5 truncate">
              {promotion.current_job_title || "No title"}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <span className="bg-white/10 text-white text-xs font-bold px-3 py-1 rounded-full">
                {promotion.current_grade}
              </span>
              <TrendingUp className="w-4 h-4 text-white/40" />
              <span className="bg-emerald-500/30 text-emerald-200 text-xs font-bold px-3 py-1 rounded-full">
                {promotion.proposed_grade}
              </span>
            </div>
          </div>
          {(totalWeighted != null || avgRating) && (
            <div className="bg-white/10 rounded-xl px-4 py-2 sm:py-3 text-center self-start sm:self-auto min-w-[100px]">
              <p className="text-[10px] sm:text-xs text-white/50 mb-0.5">
                {totalWeighted != null ? "Weighted Score" : "Evidence Avg"}
              </p>
              <p className="text-xl sm:text-2xl font-black text-white">
                {(totalWeighted ?? avgRating)?.toString()}
              </p>
              <p className="text-white/30 text-[10px]">/ 5</p>
            </div>
          )}
        </div>
        {decision && (
          <div
            className={`mt-4 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 font-semibold text-xs sm:text-sm border ${decision.color}`}
          >
            <div className="flex items-center gap-1.5 shrink-0">
              {decision.icon}
              <span>Final Decision: {decision.label}</span>
            </div>
            {promotion.conditions && (
              <span className="text-[11px] sm:text-xs font-normal sm:ml-2 opacity-80">
                · Conditions: {promotion.conditions}
              </span>
            )}
          </div>
        )}
      </div>

      {matrixStep && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-red-500" />
            Promotion Step — {matrixStep.from} → {matrixStep.to}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 sm:mb-2">
                Minimum Time Guide
              </p>
              <p className="text-xs sm:text-sm font-bold text-gray-800">
                {matrixStep.timeGuide}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 sm:mb-2">
                Core Readiness Standard
              </p>
              <p className="text-xs sm:text-sm text-gray-700">
                {matrixStep.readinessStandard}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-red-500" /> Employee Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: "Staff No.", value: promotion.employee_company_id },
            { label: "Current Grade", value: promotion.current_grade },
            { label: "Proposed Grade", value: promotion.proposed_grade },
            {
              label: "Current Title",
              value: promotion.current_job_title || "Not set",
            },
            { label: "Proposed Title", value: promotion.proposed_job_title },
            { label: "Supervisor", value: promotion.immediate_supervisor },
            { label: "Reviewing Manager", value: promotion.reviewing_manager },
            { label: "Triggering Review", value: promotion.triggering_review },
            {
              label: "Tier Authorisation",
              value: promotion.tier_authorisation || "—",
            },
            { label: "Section / Unit", value: promotion.section_unit || "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                {label}
              </p>
              <p className="text-xs sm:text-sm text-gray-800 break-words">
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <PromotionFormSections promotion={promotion} />

      <p className="text-[10px] sm:text-xs text-gray-300 text-right pb-2">
        Submitted{promotion.submitted_by_name ? ` by ${promotion.submitted_by_name}` : ""}{" "}
        · {formatDate(promotion.created_at)}
      </p>
    </div>
  );
}

// ─── Pending Detail ───────────────────────────────────────────────────────────
function PendingDetail({
  item,
  onStartAssessment,
}: {
  item: PendingPromotion;
  onStartAssessment: () => void;
}) {
  const matrixStep = getPromotionMatrixStep(item.current_grade);

  return (
    <div className="space-y-4">
      <div className="bg-[#1e3a5f] rounded-2xl p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">
          Awaiting Promotion Assessment
        </p>
        <h2 className="text-xl font-bold">{item.employee_name}</h2>
        <p className="text-white/60 text-sm mt-1">
          Current Grade: {item.current_grade}
        </p>
        <p className="text-white/40 text-xs mt-1">
          Appraisal submitted {formatDate(item.created_at)}
        </p>
        <div className="mt-4 bg-amber-500/20 border border-amber-400/30 rounded-lg px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
          Automatically flagged eligible — their Q4 (Annual) Final Score was
          ≥ 70%. No formal promotion assessment has been submitted yet.
        </div>
      </div>

      {matrixStep && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-red-500" />
            Next Step — {matrixStep.from} → {matrixStep.to}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Time Guide
              </p>
              <p className="text-sm font-bold text-gray-800">
                {matrixStep.timeGuide}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Readiness Standard
              </p>
              <p className="text-xs text-gray-700">
                {matrixStep.readinessStandard}
              </p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onStartAssessment}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition"
      >
        <Plus className="w-4 h-4" /> Start Promotion Assessment
      </button>
    </div>
  );
}

// ─── General Conditions Panel ─────────────────────────────────────────────────
function GeneralConditionsPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5 sm:px-5 sm:py-4 text-xs sm:text-sm font-bold text-gray-800"
      >
        <span className="flex items-center gap-2 text-left">
          <Award className="w-4 h-4 text-red-500 shrink-0" /> General Promotion
          Conditions
        </span>
        <ChevronRight
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 sm:px-5 border-t border-gray-100">
          <ul className="space-y-2 mt-3">
            {GENERAL_PROMOTION_CONDITIONS.map((c) => (
              <li
                key={c}
                className="flex items-start gap-2 text-xs sm:text-sm text-gray-600"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Promotion History Table ──────────────────────────────────────────────────
function PromotionHistoryTable({
  records,
  isLoading,
  onView,
}: {
  records: CompletedPromotion[];
  isLoading: boolean;
  onView: (record: CompletedPromotion) => void;
}) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg" />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400">
        <Award className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-xs sm:text-sm font-medium">No promotion history yet</p>
        <p className="text-[11px] sm:text-xs mt-1 opacity-60">
          Completed promotion assessments will appear here
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {records.map((record) => {
          const decision = decisionBadge(record.final_decision);
          const avg = avgAssessmentRating(record);
          const weighted = record.form_data?.readiness_summary?.total_weighted;
          return (
            <button
              key={record.id}
              onClick={() => onView(record)}
              className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {record.employee_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ID {record.employee_company_id}
                  </p>
                </div>
                {decision && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${decision.color}`}
                  >
                    {decision.icon}
                    {decision.label}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>
                  {record.current_grade} → {record.proposed_grade}
                </span>
                <span>· {formatDate(record.created_at)}</span>
                {(weighted != null || avg) && (
                  <span>
                    ·{" "}
                    {weighted != null
                      ? `Score ${weighted.toFixed(2)}/5`
                      : `Avg ${avg}/5`}
                  </span>
                )}
              </div>
              {record.proposed_job_title && (
                <p className="text-xs text-gray-600 mt-2 truncate">
                  {record.proposed_job_title}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Employee
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Grade Change
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Proposed Title
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Reviewing Manager
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Avg Rating
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Decision
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const decision = decisionBadge(record.final_decision);
              const avg = avgAssessmentRating(record);
              const weighted =
                record.form_data?.readiness_summary?.total_weighted;
              const scoreLabel =
                weighted != null
                  ? `${weighted.toFixed(2)}/5`
                  : avg
                    ? `${avg}/5`
                    : "—";
              return (
                <tr
                  key={record.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDate(record.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {record.employee_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      ID {record.employee_company_id}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {record.current_grade} → {record.proposed_grade}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">
                    {record.proposed_job_title || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {record.reviewing_manager || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{scoreLabel}</td>
                  <td className="px-4 py-3">
                    {decision ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${decision.color}`}
                      >
                        {decision.icon}
                        {decision.label}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onView(record)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

interface UserProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
  role: string;
  company_id: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PromotionViewPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PromotionItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [gradeFilter, setGradeFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });
  const userId = session?.user?.id ?? "";

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery<UserProfile[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data as UserProfile[];
    },
  });

  const currentUser = allUsers.find((u) => u.user_id === userId) ?? null;
  const viewerRole =
    currentUser?.role ??
    (session?.user?.user_metadata?.role as string | undefined) ??
    "";
  const viewerGradeLevel = currentUser?.grade_level ?? null;

  const canActOnOthers = canActOnOthersAccess(viewerRole, viewerGradeLevel);
  const canViewAll = canViewOthers(viewerRole, viewerGradeLevel);

  // Fetch completed promotions from promotions table
  const { data: completedRaw = [], isLoading: loadingCompleted } = useQuery<
    CompletedPromotion[]
  >({
    queryKey: ["promotions_completed"],
    enabled: !!userId,
    queryFn: async () => {
      const res = await api.get("/promotion/get_promotions");
      return (res.data?.data ?? []).map((p: CompletedPromotion) => ({
        ...p,
        type: "completed" as const,
      }));
    },
  });

  // Fetch pending (from appraisals)
  const { data: pendingRaw = [], isLoading: loadingPending } = useQuery<
    PendingPromotion[]
  >({
    queryKey: [
      "promotions_pending",
      completedRaw.map((c) => c.appraisal_id).join(","),
    ],
    enabled: !!userId && !loadingCompleted,
    queryFn: async () => {
      const res = await api.get("/promotion/get_pending");
      const data = res.data?.data ?? [];
      const completedAppraisalIds = new Set(
        completedRaw.map((c) => c.appraisal_id),
      );
      return data
        .filter((a: { id: number }) => !completedAppraisalIds.has(a.id))
        .map((a: PendingPromotion) => ({ ...a, type: "pending" as const }));
    },
  });

  const isLoading =
    loadingUsers || loadingCompleted || loadingPending;

  const filterByVisibility = <T extends PromotionItem>(items: T[]): T[] => {
    if (canViewAll) return items;
    if (!currentUser?.company_id) return [];
    return items.filter((item) => {
      const empId =
        item.type === "completed" ? item.employee_company_id : item.company_id;
      return empId === currentUser.company_id;
    });
  };

  const visiblePending = useMemo(
    () => filterByVisibility(pendingRaw),
    [pendingRaw, canViewAll, currentUser?.company_id],
  );

  const visibleCompleted = useMemo(
    () => filterByVisibility(completedRaw),
    [completedRaw, canViewAll, currentUser?.company_id],
  );

  const filteredPending = useMemo<PendingPromotion[]>(() => {
    return visiblePending.filter((item) => {
      const name = item.employee_name ?? "";
      const grade = item.current_grade ?? "";
      const matchSearch =
        !search || name.toLowerCase().includes(search.toLowerCase());
      const matchGrade = !gradeFilter || grade === gradeFilter;
      return matchSearch && matchGrade;
    });
  }, [visiblePending, search, gradeFilter]);

  const filteredHistory = useMemo<CompletedPromotion[]>(() => {
    return visibleCompleted.filter((item) => {
      const name = item.employee_name ?? "";
      const grade = item.current_grade ?? "";
      const matchSearch =
        !search || name.toLowerCase().includes(search.toLowerCase());
      const matchGrade = !gradeFilter || grade === gradeFilter;
      const matchDecision =
        !decisionFilter || item.final_decision === decisionFilter;
      return matchSearch && matchGrade && matchDecision;
    });
  }, [visibleCompleted, search, gradeFilter, decisionFilter]);

  const stats = useMemo(
    () => ({
      total: visiblePending.length + visibleCompleted.length,
      pending: visiblePending.length,
      promoted: visibleCompleted.filter(
        (p) =>
          p.final_decision === "promote" ||
          p.final_decision === "promote_with_conditions",
      ).length,
      deferred: visibleCompleted.filter(
        (p) => p.final_decision === "defer_pending_skills",
      ).length,
      notReady: visibleCompleted.filter((p) => p.final_decision === "not_ready")
        .length,
    }),
    [visiblePending, visibleCompleted],
  );

  // Capture key before TypeScript narrows `selected` to null after the guard
  const selectedKey = selected ? `${selected.type}:${selected.id}` : null;

  if (showForm) {
    return <PromotionFormPage onBack={() => setShowForm(false)} />;
  }

  if (selected) {
    return (
      <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-500 hover:text-gray-800 transition mb-4 sm:mb-6"
        >
          ← Back to promotions
        </button>
        <div className="max-w-4xl mx-auto">
          {selected.type === "completed" ? (
            <PromotionDetail promotion={selected} />
          ) : (
            <PendingDetail
              item={selected}
              onStartAssessment={() => {
                setSelected(null);
                setShowForm(true);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {PROMOTION_PAGE_COPY.title}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {canViewAll && !canActOnOthers
              ? PROMOTION_PAGE_COPY.readOnlySubtitle
              : PROMOTION_PAGE_COPY.activeSubtitle}
          </p>
          {canViewAll && !canActOnOthers && (
            <span className="inline-flex items-center mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              Read-only access
            </span>
          )}
        </div>
        {canActOnOthers && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" /> {PROMOTION_PAGE_COPY.newAssessmentButton}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-6">
        {[
          {
            label: "Total",
            value: stats.total,
            color: "bg-gray-100 text-gray-500",
          },
          {
            label: "Pending",
            value: stats.pending,
            color: "bg-amber-50 text-amber-600",
          },
          {
            label: "Promoted",
            value: stats.promoted,
            color: "bg-emerald-50 text-emerald-600",
          },
          {
            label: "Deferred",
            value: stats.deferred,
            color: "bg-blue-50 text-blue-600",
          },
          {
            label: "Not Ready",
            value: stats.notReady,
            color: "bg-red-50 text-red-600",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-gray-200 p-3 sm:p-4 flex items-center gap-3"
          >
            <div
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-black text-base sm:text-lg shrink-0 ${color}`}
            >
              {value}
            </div>
            <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide leading-tight">
              {label}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <GeneralConditionsPanel />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 mb-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 bg-gray-50/50"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="flex-1 sm:flex-initial text-xs sm:text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-red-400 text-gray-600"
          >
            <option value="">All Grades</option>
            {["L1", "L2", "L3", "L4", "L5", "L6", "L7"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
            className="flex-1 sm:flex-initial text-xs sm:text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-red-400 text-gray-600"
          >
            <option value="">All Decisions</option>
            {PROMOTION_DECISIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Pending assessments */}
      <div className="mb-8">
        <h2 className="text-sm sm:text-base font-bold text-gray-800 mb-3">
          {PROMOTION_PAGE_COPY.awaitingSectionTitle}
        </h2>
        {isLoading && <ListRowsSkeleton rows={3} />}
        {!isLoading && filteredPending.length === 0 && (
          <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-xs sm:text-sm font-medium">
              No employees awaiting promotion assessment
            </p>
            <p className="text-[11px] sm:text-xs mt-1 opacity-60">
              Staff flagged as ready for assessment in their appraisal will
              appear here
            </p>
          </div>
        )}
        <div className="space-y-2 max-w-3xl">
          {filteredPending.map((item) => (
            <PromotionCard
              key={`pending-${item.id}`}
              item={item}
              selected={selectedKey === `pending:${item.id}`}
              onClick={() => setSelected(item)}
            />
          ))}
        </div>
      </div>

      {/* Past promotion history */}
      <div>
        <div className="mb-3">
          <h2 className="text-sm sm:text-base font-bold text-gray-800">
            {PROMOTION_PAGE_COPY.historySectionTitle}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {canViewAll
              ? "Past promotion assessment results for all employees"
              : "Your past promotion assessment results"}
          </p>
        </div>
        <PromotionHistoryTable
          records={filteredHistory}
          isLoading={isLoading}
          onView={(record) => setSelected(record)}
        />
      </div>
    </div>
  );
}
