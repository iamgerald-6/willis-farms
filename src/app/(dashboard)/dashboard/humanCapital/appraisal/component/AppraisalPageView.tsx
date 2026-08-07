"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Loader2,
  FileText,
  ChevronRight,
  CalendarRange,
  Lock,
  CheckCircle2,
  Clock,
  PenLine,
  Users,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Award,
} from "lucide-react";
import {
  Ratings,
  SectionRatings,
  bandFor,
  itemRatingMeta,
  ITEM_RATING_MAX,
} from "@/lib/appraisal/scoring";
import { Quarter, isSupervisorGrade } from "@/lib/appraisal/sections";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import { DeadlineBanner } from "./DeadlineBanner";
import { ListRowsSkeleton } from "@/components/skeletons/PageSkeletons";

export interface Appraisal {
  id: string;
  company_id: string;
  employee_name: string;
  job_title: string;
  current_grade: string;
  grade_band: string;
  review_quarter: Quarter;
  review_year: number;
  immediate_supervisor: string;
  supervisor_email?: string | null;
  employee_email?: string | null;
  reviewing_manager?: string | null;
  period_covered?: string | null;
  section_authorisations_held?: string | null;
  employee_ratings?: Ratings | null;
  supervisor_ratings?: Ratings | null;
  employee_weighted_score?: number | null;
  supervisor_weighted_score?: number | null;
  final_quarter_score?: number | null;
  final_review_date?: string | null;
  promotion_readiness: string;
  strengths_observed?: string | null;
  improvement_areas?: string | null;
  agreed_actions?: string | null;
  employee_comments?: string | null;
  submitted_by?: "employee" | "supervisor" | "both";
  status?: "open" | "submitted" | "final_reviewed" | "locked" | "reopened";
  locked_reason?: "employee_incomplete" | "supervisor_incomplete" | "reopen_incomplete" | null;
  deadline_at?: string | null;
  reopened_deadline_at?: string | null;
  appeal_exhausted?: boolean;
  employee_penalty_points?: number | null;
  supervisor_id?: string | null;
  employee_user_id?: string | null;
  created_at: string;
}

interface Justification {
  id: string;
  appraisal_id: string;
  supervisor_id: string;
  reason_text: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by_name?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  points_waived: boolean;
  created_at: string;
}

// Supervisor is derived from grade_level >= L4 (line-supervisor threshold),
// NOT from role. "Full access" (see all employees) is a separate, L5+ concept.
export interface ViewerContext {
  role: "employee" | "manager" | "admin" | "super_admin";
  gradeLevel: string | null;
  companyId?: string;
  userId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PROMOTION_LABELS: Record<string, string> = {
  not_yet_ready: "Not Yet Ready",
  developing: "Developing Toward Next Level",
  nearly_ready: "Nearly Ready",
  ready_for_assessment: "Ready for Promotion Assessment",
  ready_for_expanded_responsibility: "Ready for Expanded Responsibility",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Raw item ratings are 1–5; returns the section average as a 0–100% score. */
function sectionAvg(sectionRatings: SectionRatings): number | null {
  const vals = Object.values(sectionRatings)
    .map((r) => r.rating)
    .filter((r): r is number => r !== null && r !== undefined);
  if (!vals.length) return null;
  const avgRaw = vals.reduce((a, b) => a + b, 0) / vals.length;
  return (avgRaw / ITEM_RATING_MAX) * 100;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function periodLabel(a: Appraisal) {
  return a.review_quarter === "Q4"
    ? `Q4 (Annual) ${a.review_year}`
    : `${a.review_quarter} ${a.review_year}`;
}

// ─── Rating Cell ──────────────────────────────────────────────────────────────
function RatingCell({
  rating,
  hidden,
}: {
  rating: number | null;
  hidden: boolean;
}) {
  if (hidden) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-300 text-xs font-mono select-none">
        <Lock className="w-3 h-3" /> •••
      </span>
    );
  }
  if (rating == null) return <span className="text-gray-300 text-xs">—</span>;
  const meta = itemRatingMeta(rating);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${meta?.bg} ${meta?.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta?.color}`} />
      {rating}/5 · {meta?.label}
    </span>
  );
}

function CommentCell({
  comment,
  hidden,
}: {
  comment: string;
  hidden: boolean;
}) {
  if (hidden)
    return (
      <span className="text-gray-200 text-xs font-mono select-none">
        ••••••••
      </span>
    );
  if (!comment) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className="text-xs text-gray-500 italic block break-words">
      {comment}
    </span>
  );
}

function ScoreDisplay({
  score,
  hidden,
  label,
}: {
  score: number | null;
  hidden: boolean;
  label: string;
}) {
  if (hidden) {
    return (
      <div className="text-center flex-1 sm:flex-initial">
        <p className="text-[10px] sm:text-xs text-white/50 mb-1">{label}</p>
        <div className="flex items-center justify-center gap-1 text-white/20">
          <Lock className="w-3.5 h-3.5" />
          <span className="text-base sm:text-lg font-black">•••</span>
        </div>
      </div>
    );
  }
  if (score === null) {
    return (
      <div className="text-center flex-1 sm:flex-initial">
        <p className="text-[10px] sm:text-xs text-white/50 mb-1">{label}</p>
        <span className="text-white/30 text-xs sm:text-sm block whitespace-nowrap">
          Not submitted
        </span>
      </div>
    );
  }
  const band = bandFor(score);
  const colorMap: Record<string, string> = {
    "bg-emerald-500": "text-emerald-300",
    "bg-green-500": "text-green-300",
    "bg-amber-400": "text-amber-300",
    "bg-orange-400": "text-orange-300",
    "bg-red-500": "text-red-300",
  };
  const color = band ? (colorMap[band.color] ?? "text-white") : "text-white";

  return (
    <div className="text-center flex-1 sm:flex-initial">
      <p className="text-[10px] sm:text-xs text-white/50 mb-1">{label}</p>
      <p className={`text-xl sm:text-2xl font-black ${color}`}>
        {score.toFixed(1)}
      </p>
      <p className="text-white/30 text-[10px] sm:text-xs">%</p>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({
  status,
  submittedBy,
}: {
  status?: string;
  submittedBy?: string;
}) {
  if (status === "locked") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        <Lock className="w-3.5 h-3.5" /> Locked
      </span>
    );
  }
  if (status === "reopened") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
        <AlertTriangle className="w-3.5 h-3.5" /> Reopened
      </span>
    );
  }
  if (status === "final_reviewed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <ShieldCheck className="w-3.5 h-3.5" /> Final Reviewed
      </span>
    );
  }
  if (submittedBy === "both") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <CheckCircle2 className="w-3.5 h-3.5" /> Both Submitted
      </span>
    );
  }
  if (submittedBy === "supervisor") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <CheckCircle2 className="w-3.5 h-3.5" /> Supervisor Submitted
      </span>
    );
  }
  if (submittedBy === "employee") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3.5 h-3.5" /> Awaiting Supervisor
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-gray-100 text-gray-500">
      <Clock className="w-3.5 h-3.5" /> Not Started
    </span>
  );
}

// ─── Appraisal Card ───────────────────────────────────────────────────────────
function AppraisalCard({
  appraisal,
  onClick,
}: {
  appraisal: Appraisal;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all p-4 sm:p-5 flex items-center gap-3 sm:gap-4 group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 flex-wrap">
          <StatusBadge
            status={appraisal.status}
            submittedBy={appraisal.submitted_by}
          />
          <span
            className={`text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-semibold ${
              appraisal.review_quarter === "Q4"
                ? "bg-purple-50 text-purple-600"
                : "bg-blue-50 text-blue-600"
            }`}
          >
            {appraisal.review_quarter === "Q4" ? "Annual" : "Quarterly"}
          </span>
          <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
            {appraisal.grade_band}
          </span>
        </div>
        <p className="text-sm sm:text-base font-bold text-gray-900 truncate">
          {appraisal.employee_name}
        </p>
        <p className="text-[11px] sm:text-xs text-gray-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="flex items-center gap-1">
            <CalendarRange className="w-3 h-3 shrink-0" />{" "}
            {periodLabel(appraisal)}
          </span>
          {appraisal.final_review_date && (
            <span className="text-blue-500 font-medium">
              · Review: {formatDate(appraisal.final_review_date)}
            </span>
          )}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" />
    </button>
  );
}

// ─── Full Detail View ─────────────────────────────────────────────────────────
function AppraisalDetail({
  appraisal,
  viewer,
  onFillForm,
  onFinalReview,
  onSubmitJustification,
}: {
  appraisal: Appraisal;
  viewer: ViewerContext;
  onFillForm: () => void;
  onFinalReview: () => void;
  onSubmitJustification: () => void;
}) {
  const bothSubmitted = appraisal.submitted_by === "both";

  // Line-supervisor threshold (L4+) — governs who fills which side of the form.
  const viewerIsSupervisor = isSupervisorGrade(viewer.gradeLevel);
  const viewerIsEmployee = !viewerIsSupervisor;

  const hideEmployeeRatings = !bothSubmitted && viewerIsSupervisor;
  const hideSupervisorRatings = !bothSubmitted && viewerIsEmployee;

  const employeeRatings = appraisal.employee_ratings ?? {};
  const supervisorRatings = appraisal.supervisor_ratings ?? {};
  const allSectionKeys = Array.from(
    new Set([
      ...Object.keys(employeeRatings),
      ...Object.keys(supervisorRatings),
    ]),
  );

  const getSectionItems = (sectionKey: string): string[] => {
    const empItems = Object.keys(employeeRatings[sectionKey] ?? {});
    const supItems = Object.keys(supervisorRatings[sectionKey] ?? {});
    return Array.from(new Set([...empItems, ...supItems]));
  };

  const canEmployeeFill =
    viewerIsEmployee &&
    appraisal.status !== "locked" &&
    appraisal.status !== "reopened" &&
    appraisal.submitted_by !== "employee" &&
    appraisal.submitted_by !== "both";

  const canSupervisorFill =
    viewerIsSupervisor &&
    appraisal.status !== "locked" &&
    appraisal.status !== "final_reviewed" &&
    (appraisal.status === "reopened"
      ? appraisal.submitted_by === "employee"
      : appraisal.submitted_by !== "supervisor" &&
        appraisal.submitted_by !== "both");

  const showCTA = canEmployeeFill || canSupervisorFill;

  const canSubmitJustification =
    appraisal.status === "locked" &&
    appraisal.locked_reason === "supervisor_incomplete" &&
    !appraisal.appeal_exhausted &&
    (viewer.userId === appraisal.supervisor_id ||
      hasFullAppraisalAccess(viewer.role, viewer.gradeLevel));

  const { data: justifications } = useQuery<Justification[]>({
    queryKey: ["appraisal-justifications", appraisal.id],
    queryFn: async () => {
      const res = await api.get(
        `/appraisal/justification?appraisal_id=${appraisal.id}`,
      );
      return res.data.data ?? [];
    },
  });
  const latestJustification = justifications?.[0] ?? null;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Header ── */}
      <div className="bg-[#1e3a5f] rounded-2xl p-4 sm:p-6 text-white">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-white/50">
                {appraisal.review_quarter === "Q4"
                  ? "Annual Appraisal (Q4)"
                  : "Quarterly Review"}
              </span>
              <span className="text-white/30">·</span>
              <span className="text-[10px] sm:text-xs font-semibold text-white/50 uppercase tracking-widest">
                {appraisal.grade_band}
              </span>
              <StatusBadge
                status={appraisal.status}
                submittedBy={appraisal.submitted_by}
              />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold truncate">
              {appraisal.employee_name}
            </h2>
            <p className="text-white/60 text-xs sm:text-sm mt-0.5 truncate">
              {appraisal.job_title}
            </p>
            <p className="text-white/40 text-[11px] sm:text-xs mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="flex items-center gap-1">
                <CalendarRange className="w-3.5 h-3.5 shrink-0" />{" "}
                {periodLabel(appraisal)}
              </span>
              {appraisal.immediate_supervisor && (
                <span className="truncate">
                  · Supervisor: {appraisal.immediate_supervisor}
                </span>
              )}
            </p>
          </div>

          <div className="flex gap-2 sm:gap-4 bg-white/10 rounded-xl p-3 sm:p-4 justify-between sm:justify-start w-full lg:w-auto">
            <ScoreDisplay
              score={appraisal.employee_weighted_score ?? null}
              hidden={hideEmployeeRatings}
              label="Employee Score"
            />
            <div className="w-px bg-white/10" />
            <ScoreDisplay
              score={appraisal.supervisor_weighted_score ?? null}
              hidden={hideSupervisorRatings}
              label="Supervisor Score"
            />
            {appraisal.status === "final_reviewed" &&
              appraisal.final_quarter_score != null && (
                <>
                  <div className="w-px bg-white/10" />
                  <ScoreDisplay
                    score={appraisal.final_quarter_score}
                    hidden={false}
                    label="Final Quarter Score"
                  />
                </>
              )}
          </div>
        </div>

        {appraisal.deadline_at &&
          appraisal.status !== "final_reviewed" &&
          appraisal.status !== "locked" && (
            <div className="mt-4 bg-white/10 rounded-lg px-3 py-2 flex items-center gap-2 text-xs sm:text-sm">
              <CalendarRange className="w-4 h-4 text-white/60 shrink-0" />
              <span className="text-white/60">Deadline:</span>
              <span className="font-semibold">
                {formatDate(appraisal.deadline_at)}
              </span>
            </div>
          )}

        {appraisal.final_review_date && (
          <div className="mt-2 bg-white/10 rounded-lg px-3 py-2 flex items-center gap-2 text-xs sm:text-sm">
            <CalendarRange className="w-4 h-4 text-white/60 shrink-0" />
            <span className="text-white/60">Final Review Meeting:</span>
            <span className="font-semibold">
              {formatDate(appraisal.final_review_date)}
            </span>
          </div>
        )}
      </div>

      {/* ── Locked banner (visible to everyone, including the employee) ── */}
      {appraisal.status === "locked" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm font-semibold text-red-800">
                This appraisal is locked
              </p>
              <p className="text-[11px] sm:text-xs text-red-600 mt-0.5">
                {appraisal.locked_reason === "supervisor_incomplete"
                  ? "The supervisor evaluation deadline was missed. A 10-point deduction has been applied to the supervisor's own appraisal unless waived by an approved justification."
                  : appraisal.locked_reason === "reopen_incomplete"
                    ? "The reopened completion window expired without a final review. Penalties have been applied and no further appeals are permitted."
                    : "The self-assessment deadline was missed."}
              </p>
            </div>
          </div>
          {canSubmitJustification && (
            <button
              onClick={onSubmitJustification}
              className="w-full md:w-auto flex-shrink-0 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition flex items-center justify-center gap-2"
            >
              <ShieldAlert className="w-4 h-4" />
              Submit Justification
            </button>
          )}
        </div>
      )}

      {/* ── Justification outcome (visible to the employee too) ── */}
      {latestJustification && (
        <div
          className={`rounded-xl p-4 border ${
            latestJustification.status === "approved"
              ? "bg-emerald-50 border-emerald-200"
              : latestJustification.status === "rejected"
                ? "bg-gray-50 border-gray-200"
                : "bg-amber-50 border-amber-200"
          }`}
        >
          <p className="text-xs sm:text-sm font-semibold flex items-center gap-2">
            {latestJustification.status === "approved" ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            ) : latestJustification.status === "rejected" ? (
              <ShieldAlert className="w-4 h-4 text-gray-500" />
            ) : (
              <Clock className="w-4 h-4 text-amber-600" />
            )}
            Justification{" "}
            {latestJustification.status === "pending"
              ? "under review"
              : latestJustification.status}
          </p>
          <p className="text-[11px] sm:text-xs text-gray-600 mt-1.5">
            <strong>Reason given:</strong> {latestJustification.reason_text}
          </p>
          {latestJustification.reviewed_by_name && (
            <p className="text-[11px] sm:text-xs text-gray-600 mt-1">
              <strong>
                Reviewed by {latestJustification.reviewed_by_name}
              </strong>
              {latestJustification.review_notes
                ? ` — ${latestJustification.review_notes}`
                : ""}
            </p>
          )}
          {latestJustification.status !== "pending" && (
            <p className="text-[11px] sm:text-xs mt-1 font-medium">
              10-point deduction{" "}
              {latestJustification.points_waived ? "waived" : "stands"}.
            </p>
          )}
        </div>
      )}

      {/* ── CTA ── */}
      {showCTA && (
        <div className="space-y-3">
          <DeadlineBanner
            reviewQuarter={appraisal.review_quarter}
            reviewYear={appraisal.review_year}
            status={appraisal.status}
            deadlineAt={appraisal.deadline_at}
            reopenedDeadlineAt={appraisal.reopened_deadline_at}
          />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <PenLine className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm font-semibold text-amber-800">
                {canEmployeeFill
                  ? "Your self-assessment is pending"
                  : "Supervisor evaluation is pending"}
              </p>
              <p className="text-[11px] sm:text-xs text-amber-600 mt-0.5">
                {canEmployeeFill
                  ? "Fill in your self-assessment. Your ratings will be hidden from your supervisor until they complete their review."
                  : "The employee has submitted their self-assessment. Complete your supervisor evaluation now."}
              </p>
            </div>
          </div>
          <button
            onClick={onFillForm}
            className="w-full md:w-auto flex-shrink-0 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition flex items-center justify-center gap-2"
          >
            <PenLine className="w-4 h-4" />
            Fill Form
          </button>
        </div>
        </div>
      )}

      {/* ── Final Review Meeting CTA ── */}
      {bothSubmitted &&
        viewerIsSupervisor &&
        appraisal.status !== "final_reviewed" &&
        appraisal.status !== "locked" &&
        (appraisal.status === "reopened" ||
          (appraisal.final_review_date &&
            new Date(appraisal.final_review_date) <= new Date())) && (
          <div className="space-y-3">
            {appraisal.status === "reopened" && (
              <DeadlineBanner
                reviewQuarter={appraisal.review_quarter}
                reviewYear={appraisal.review_year}
                status={appraisal.status}
                deadlineAt={appraisal.deadline_at}
                reopenedDeadlineAt={appraisal.reopened_deadline_at}
              />
            )}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-blue-800">
                  Both parties have submitted — Final Review Meeting pending
                </p>
                <p className="text-[11px] sm:text-xs text-blue-600 mt-0.5">
                  Review both scores together, discuss any differences, and lock
                  in the final agreed score.
                </p>
              </div>
            </div>
            <button
              onClick={onFinalReview}
              className="w-full md:w-auto flex-shrink-0 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#1e3a5f] text-white hover:bg-[#16304f] transition flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              Open Final Review
            </button>
          </div>
          </div>
        )}

      {/* ── Hidden notice ── */}
      {!bothSubmitted && appraisal.status !== "locked" && (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[11px] sm:text-xs text-gray-500">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="leading-snug">
            {viewerIsEmployee
              ? "Supervisor ratings are hidden until both parties have submitted."
              : "Employee ratings are hidden until both parties have submitted."}
          </span>
        </div>
      )}

      {/* ── Ratings ── */}
      {allSectionKeys.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs sm:text-sm font-bold text-gray-800">
            Performance Ratings
          </h3>

          {allSectionKeys.map((sectionKey) => {
            const items = getSectionItems(sectionKey);
            const empSecRatings = employeeRatings[sectionKey] ?? {};
            const supSecRatings = supervisorRatings[sectionKey] ?? {};
            const empAvg = !hideEmployeeRatings
              ? sectionAvg(empSecRatings)
              : null;
            const supAvg = !hideSupervisorRatings
              ? sectionAvg(supSecRatings)
              : null;

            return (
              <div
                key={sectionKey}
                className="border border-gray-200 rounded-xl overflow-hidden bg-white"
              >
                <div className="bg-[#1e3a5f] px-4 py-3 flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 items-start sm:items-center">
                  <span className="text-white text-xs sm:text-sm font-semibold">
                    Section {sectionKey}
                  </span>
                  <div className="text-left sm:text-center flex items-center sm:justify-center gap-1 w-full sm:w-auto">
                    <span className="text-white/50 text-[11px] sm:text-xs">
                      Employee
                    </span>
                    {empAvg !== null && (
                      <span className="ml-1.5 text-white text-[11px] sm:text-xs font-bold bg-white/10 px-1.5 py-0.5 rounded">
                        avg {empAvg.toFixed(0)}%
                      </span>
                    )}
                    {hideEmployeeRatings && (
                      <Lock className="w-3 h-3 text-white/30 inline ml-1" />
                    )}
                  </div>
                  <div className="text-left sm:text-center flex items-center sm:justify-center gap-1 w-full sm:w-auto">
                    <span className="text-white/50 text-[11px] sm:text-xs">
                      Supervisor
                    </span>
                    {supAvg !== null && (
                      <span className="ml-1.5 text-white text-[11px] sm:text-xs font-bold bg-white/10 px-1.5 py-0.5 rounded">
                        avg {supAvg.toFixed(0)}%
                      </span>
                    )}
                    {hideSupervisorRatings && (
                      <Lock className="w-3 h-3 text-white/30 inline ml-1" />
                    )}
                  </div>
                </div>

                <div className="hidden sm:grid sm:grid-cols-3 gap-4 px-4 py-2 bg-gray-50 text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <span>Review Area</span>
                  <span className="text-center">Employee Rating</span>
                  <span className="text-center">Supervisor Rating</span>
                </div>

                <div className="divide-y divide-gray-100">
                  {items.map((item) => {
                    const empItem = empSecRatings[item] ?? {
                      rating: null,
                      comment: "",
                    };
                    const supItem = supSecRatings[item] ?? {
                      rating: null,
                      comment: "",
                    };

                    return (
                      <div
                        key={item}
                        className="flex flex-col sm:grid sm:grid-cols-3 gap-3 sm:gap-4 items-start px-4 py-4 sm:py-3 hover:bg-gray-50/40 transition-colors"
                      >
                        <span className="text-xs sm:text-sm font-medium sm:font-normal text-gray-800 sm:text-gray-700 leading-snug">
                          {item}
                        </span>
                        <div className="space-y-1 w-full bg-gray-50/60 sm:bg-transparent p-2.5 sm:p-0 rounded-lg border border-gray-100 sm:border-0">
                          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-1 sm:hidden">
                            Employee
                          </span>
                          <RatingCell
                            rating={empItem.rating}
                            hidden={hideEmployeeRatings}
                          />
                          <div className="mt-1">
                            <CommentCell
                              comment={empItem.comment}
                              hidden={hideEmployeeRatings}
                            />
                          </div>
                        </div>
                        <div className="space-y-1 w-full bg-gray-50/60 sm:bg-transparent p-2.5 sm:p-0 rounded-lg border border-gray-100 sm:border-0">
                          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-1 sm:hidden">
                            Supervisor
                          </span>
                          <RatingCell
                            rating={supItem.rating}
                            hidden={hideSupervisorRatings}
                          />
                          <div className="mt-1">
                            <CommentCell
                              comment={supItem.comment}
                              hidden={hideSupervisorRatings}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Comments (both submitted) ── */}
      {bothSubmitted && (
        <div className="space-y-3">
          <h3 className="text-xs sm:text-sm font-bold text-gray-800">
            Comments &amp; Development
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                label: "Strengths Observed",
                value: appraisal.strengths_observed,
              },
              {
                label: "Improvement Areas",
                value: appraisal.improvement_areas,
              },
              { label: "Agreed Actions", value: appraisal.agreed_actions },
              {
                label: "Employee Comments",
                value: appraisal.employee_comments,
              },
            ].map(({ label, value }) =>
              value ? (
                <div
                  key={label}
                  className="bg-gray-50 rounded-xl p-4 border border-gray-100"
                >
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    {label}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-700 leading-relaxed break-words">
                    {value}
                  </p>
                </div>
              ) : null,
            )}
          </div>

          {appraisal.promotion_readiness && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Promotion Readiness Notes
              </p>
              <p className="text-xs sm:text-sm font-bold text-blue-800">
                {PROMOTION_LABELS[appraisal.promotion_readiness] ??
                  appraisal.promotion_readiness}
              </p>
            </div>
          )}

          {appraisal.review_quarter === "Q4" &&
            appraisal.status === "final_reviewed" && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
                <Award className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs sm:text-sm font-bold text-purple-800">
                    Annual Final Score computed
                  </p>
                  <p className="text-[11px] sm:text-xs text-purple-600 mt-0.5">
                    Promotion eligibility for the year has been calculated
                    automatically (Final Score ≥ 70% required) — see the
                    employee's profile for the result.
                  </p>
                </div>
              </div>
            )}
        </div>
      )}

      <p className="text-[10px] sm:text-xs text-gray-300 text-right pb-2">
        Submitted {formatDate(appraisal.created_at)}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AppraisalLandingPage({
  viewer,
  onNavigateToForm,
  onNavigateToFinalReview,
  onNavigateToJustification,
}: {
  viewer: ViewerContext;
  onNavigateToForm?: (appraisalId?: string) => void;
  onNavigateToFinalReview?: (appraisalId: string) => void;
  onNavigateToJustification?: (appraisalId: string) => void;
}) {
  const [selected, setSelected] = useState<Appraisal | null>(null);
  const [quarterFilter, setQuarterFilter] = useState<"" | Quarter>("");

  // Full access (Manager/Admin/Super Admin/L5+) sees everyone; everyone
  // else sees only their own appraisal data (spec Section 4).
  const viewerHasFullAccess = hasFullAppraisalAccess(
    viewer.role,
    viewer.gradeLevel,
  );

  const queryParams = new URLSearchParams();
  if (!viewerHasFullAccess && viewer.companyId) {
    queryParams.set("company_id", viewer.companyId);
  }
  if (quarterFilter) queryParams.set("review_quarter", quarterFilter);

  const { data, isLoading, isError } = useQuery<Appraisal[]>({
    queryKey: [
      "appraisals",
      viewer.gradeLevel,
      viewer.companyId,
      quarterFilter,
    ],
    queryFn: async () => {
      const res = await api.get(
        `/appraisal/get_appraisal?${queryParams.toString()}`,
      );
      return res.data.data ?? [];
    },
  });

  const appraisals = data ?? [];
  const viewerIsSupervisor = isSupervisorGrade(viewer.gradeLevel);

  if (selected) {
    return (
      <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-500 hover:text-gray-800 transition mb-4 sm:mb-6 focus:outline-none"
        >
          ← Back to appraisals
        </button>
        <div className="max-w-5xl bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
          <AppraisalDetail
            appraisal={selected}
            viewer={viewer}
            onFillForm={() => onNavigateToForm?.(selected.id)}
            onFinalReview={() => onNavigateToFinalReview?.(selected.id)}
            onSubmitJustification={() =>
              onNavigateToJustification?.(selected.id)
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Performance Appraisals
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            {viewerHasFullAccess
              ? "Appraisals across the organisation"
              : "Your performance reviews"}
          </p>
        </div>

        <button
          onClick={() => onNavigateToForm?.()}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition w-full sm:w-auto"
        >
          <PenLine className="w-4 h-4" />
          {viewerIsSupervisor ? "New Appraisal" : "Appraisal Form"}
        </button>
      </div>

      <div className="flex gap-1.5 sm:gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
        {(["", "Q1", "Q2", "Q3", "Q4"] as const).map((q) => (
          <button
            key={q}
            onClick={() => setQuarterFilter(q)}
            className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border-2 transition-all whitespace-nowrap ${
              quarterFilter === q
                ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
          >
            {q === "" ? "All" : q === "Q4" ? "Q4 (Annual)" : q}
          </button>
        ))}
      </div>

      {isLoading && <ListRowsSkeleton rows={6} />}

      {isError && (
        <div className="text-center py-24 text-red-500 text-xs sm:text-sm">
          Failed to load appraisals. Please try again.
        </div>
      )}

      {!isLoading && !isError && appraisals.length === 0 && (
        <div className="text-center py-24 text-gray-400 bg-white rounded-2xl border border-gray-100 p-6">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-xs sm:text-sm font-medium">No appraisals yet</p>
          <p className="text-[11px] sm:text-xs mt-1 opacity-60">
            {viewerIsSupervisor
              ? "Start a new appraisal using the button above"
              : "Complete your self-assessment using the button above"}
          </p>
        </div>
      )}

      <div className="space-y-2.5 sm:space-y-3 max-w-3xl">
        {appraisals.map((a) => (
          <AppraisalCard
            key={a.id}
            appraisal={a}
            onClick={() => setSelected(a)}
          />
        ))}
      </div>
    </div>
  );
}
