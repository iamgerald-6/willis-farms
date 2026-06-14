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
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type RatingValue = 1 | 2 | 3 | 4 | 5;

interface RatingItem {
  rating: RatingValue | null;
  comment: string;
}

interface SectionRatings {
  [itemLabel: string]: RatingItem;
}

interface Ratings {
  [sectionKey: string]: SectionRatings;
}

export interface Appraisal {
  id: string;
  company_id: string;
  employee_name: string;
  job_title: string;
  current_grade: string;
  grade_band: string;
  cycle: "quarterly" | "annual";
  review_quarter?: string | null;
  review_year: number;
  immediate_supervisor: string;
  reviewing_manager?: string | null;
  period_covered?: string | null;
  section_authorisations_held?: string | null;
  employee_ratings?: Ratings | null;
  supervisor_ratings?: Ratings | null;
  employee_weighted_score?: number | null;
  supervisor_weighted_score?: number | null;
  final_review_date?: string | null;
  promotion_readiness: string;
  strengths_observed?: string | null;
  improvement_areas?: string | null;
  agreed_actions?: string | null;
  employee_comments?: string | null;
  // submitted_by: who has submitted so far
  // "employee"  → only employee done
  // "supervisor" → only supervisor done
  // "both"      → both done
  // undefined   → nobody yet
  submitted_by?: "employee" | "supervisor" | "both";
  status?: string;
  created_at: string;
}

// ─── Viewer context ───────────────────────────────────────────────────────────
// isSupervisor is derived from grade_level >= L3, NOT from role.
// The role can be employee, manager, admin, super_admin — it doesn't matter here.
export interface ViewerContext {
  role: "employee" | "manager" | "admin" | "super_admin";
  gradeLevel: string | null; // e.g. "L1", "L3", "L4", "L5"
  companyId?: string;
}

// Grade levels in order — L3+ is "supervisor"
const GRADE_ORDER = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"];

function gradeIndex(g: string | null | undefined): number {
  if (!g) return -1;
  const clean = g.split("/")[0].trim();
  return GRADE_ORDER.indexOf(clean);
}

/** A user is a supervisor if their grade is L3 or above */
function isSupervisorGrade(grade: string | null | undefined): boolean {
  return gradeIndex(grade) >= 2; // L3 is index 2
}

// ─── Constants ────────────────────────────────────────────────────────────────
const RATING_LABELS: Record<number, string> = {
  1: "Unsatisfactory",
  2: "Below Expectation",
  3: "Meets Expectation",
  4: "Above Expectation",
  5: "Excellent",
};

const RATING_BAR: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-400",
  3: "bg-amber-400",
  4: "bg-green-400",
  5: "bg-emerald-500",
};

const PROMOTION_LABELS: Record<string, string> = {
  not_yet_ready: "Not Yet Ready",
  developing: "Developing Toward Next Level",
  nearly_ready: "Nearly Ready",
  ready_for_assessment: "Ready for Promotion Assessment",
  ready_for_expanded_responsibility: "Ready for Expanded Responsibility",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sectionAvg(sectionRatings: SectionRatings): number | null {
  const vals = Object.values(sectionRatings)
    .map((r) => r.rating)
    .filter((r): r is RatingValue => r !== null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Rating Cell ──────────────────────────────────────────────────────────────
function RatingCell({
  rating,
  hidden,
}: {
  rating: RatingValue | null;
  hidden: boolean;
}) {
  if (hidden) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-300 text-xs font-mono select-none">
        <Lock className="w-3 h-3" /> •••
      </span>
    );
  }
  if (!rating) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold
      ${
        rating >= 5
          ? "bg-emerald-50 text-emerald-700"
          : rating >= 4
            ? "bg-green-50 text-green-700"
            : rating >= 3
              ? "bg-amber-50 text-amber-700"
              : rating >= 2
                ? "bg-orange-50 text-orange-700"
                : "bg-red-50 text-red-700"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${RATING_BAR[rating]}`} />
      {rating} · {RATING_LABELS[rating]}
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
  const color =
    score >= 4.5
      ? "text-emerald-300"
      : score >= 3.5
        ? "text-green-300"
        : score >= 2.5
          ? "text-amber-300"
          : score >= 1.5
            ? "text-orange-300"
            : "text-red-300";

  return (
    <div className="text-center flex-1 sm:flex-initial">
      <p className="text-[10px] sm:text-xs text-white/50 mb-1">{label}</p>
      <p className={`text-xl sm:text-2xl font-black ${color}`}>
        {score.toFixed(2)}
      </p>
      <p className="text-white/30 text-[10px] sm:text-xs">/ 5</p>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ submittedBy }: { submittedBy?: string }) {
  if (submittedBy === "both") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
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
  const period =
    appraisal.cycle === "quarterly"
      ? `${appraisal.review_quarter ?? ""} ${appraisal.review_year}`
      : (appraisal.period_covered ?? String(appraisal.review_year));

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all p-4 sm:p-5 flex items-center gap-3 sm:gap-4 group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 flex-wrap">
          <StatusBadge submittedBy={appraisal.submitted_by} />
          <span
            className={`text-[11px] sm:text-xs px-2 py-0.5 rounded-full font-semibold ${
              appraisal.cycle === "quarterly"
                ? "bg-blue-50 text-blue-600"
                : "bg-purple-50 text-purple-600"
            }`}
          >
            {appraisal.cycle === "quarterly" ? "Quarterly" : "Annual"}
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
            <CalendarRange className="w-3 h-3 shrink-0" /> {period}
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
}: {
  appraisal: Appraisal;
  viewer: ViewerContext;
  onFillForm: () => void;
  onFinalReview: () => void;
}) {
  const bothSubmitted = appraisal.submitted_by === "both";

  // Supervisor status is determined purely by grade_level, not role
  const viewerIsSupervisor = isSupervisorGrade(viewer.gradeLevel);
  const viewerIsEmployee = !viewerIsSupervisor;

  // Visibility rules (mirror the old logic but using grade-based supervisor check):
  // - Employee sees their own ratings always; supervisor ratings hidden until both submit
  // - Supervisor sees supervisor ratings always; employee ratings hidden until both submit
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

  const period =
    appraisal.cycle === "quarterly"
      ? `${appraisal.review_quarter ?? ""} ${appraisal.review_year}`
      : (appraisal.period_covered ?? String(appraisal.review_year));

  // Who can fill what:
  // - Employee (grade < L3): can fill self-appraisal if not yet submitted by employee or both
  // - Supervisor (grade >= L3): can fill supervisor review if not yet submitted by supervisor or both
  const canEmployeeFill =
    viewerIsEmployee &&
    appraisal.submitted_by !== "employee" &&
    appraisal.submitted_by !== "both";

  const canSupervisorFill =
    viewerIsSupervisor &&
    appraisal.submitted_by !== "supervisor" &&
    appraisal.submitted_by !== "both";

  const showCTA = canEmployeeFill || canSupervisorFill;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Header ── */}
      <div className="bg-[#1e3a5f] rounded-2xl p-4 sm:p-6 text-white">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-white/50">
                {appraisal.cycle === "quarterly"
                  ? "Quarterly Review"
                  : "Annual Appraisal"}
              </span>
              <span className="text-white/30">·</span>
              <span className="text-[10px] sm:text-xs font-semibold text-white/50 uppercase tracking-widest">
                {appraisal.grade_band}
              </span>
              <StatusBadge submittedBy={appraisal.submitted_by} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold truncate">
              {appraisal.employee_name}
            </h2>
            <p className="text-white/60 text-xs sm:text-sm mt-0.5 truncate">
              {appraisal.job_title}
            </p>
            <p className="text-white/40 text-[11px] sm:text-xs mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="flex items-center gap-1">
                <CalendarRange className="w-3.5 h-3.5 shrink-0" /> {period}
              </span>
              {appraisal.immediate_supervisor && (
                <span className="truncate">
                  · Supervisor: {appraisal.immediate_supervisor}
                </span>
              )}
            </p>
          </div>

          {/* Scores */}
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
            {bothSubmitted &&
              appraisal.employee_weighted_score &&
              appraisal.supervisor_weighted_score && (
                <>
                  <div className="w-px bg-white/10" />
                  <ScoreDisplay
                    score={
                      (appraisal.employee_weighted_score +
                        appraisal.supervisor_weighted_score) /
                      2
                    }
                    hidden={false}
                    label="Final Average"
                  />
                </>
              )}
          </div>
        </div>

        {appraisal.final_review_date && (
          <div className="mt-4 bg-white/10 rounded-lg px-3 py-2 flex items-center gap-2 text-xs sm:text-sm">
            <CalendarRange className="w-4 h-4 text-white/60 shrink-0" />
            <span className="text-white/60">Final Review Meeting:</span>
            <span className="font-semibold">
              {formatDate(appraisal.final_review_date)}
            </span>
          </div>
        )}
      </div>

      {/* ── CTA ── */}
      {showCTA && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <PenLine className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs sm:text-sm font-semibold text-amber-800">
                {canEmployeeFill
                  ? "Your self-appraisal is pending"
                  : "Supervisor review is pending"}
              </p>
              <p className="text-[11px] sm:text-xs text-amber-600 mt-0.5">
                {canEmployeeFill
                  ? "Fill in your self-appraisal. Your ratings will be hidden from your supervisor until they complete their review."
                  : "The employee has submitted their self-appraisal. Complete your supervisor review now."}
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
      )}

      {/* ── Final Review Meeting CTA — supervisor only, both submitted, not yet final_reviewed ── */}
      {bothSubmitted &&
        viewerIsSupervisor &&
        appraisal.status !== "final_reviewed" &&
        appraisal.final_review_date &&
        new Date(appraisal.final_review_date) <= new Date() && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-blue-800">
                  Both parties have submitted — Final Review Meeting pending
                </p>
                <p className="text-[11px] sm:text-xs text-blue-600 mt-0.5">
                  Review both scores together, discuss any differences, and lock
                  in the final agreed ratings.
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
        )}

      {bothSubmitted &&
        viewerIsSupervisor &&
        appraisal.status !== "final_reviewed" &&
        appraisal.final_review_date &&
        new Date(appraisal.final_review_date) > new Date() && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-3">
            <CalendarRange className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm font-semibold text-gray-600">
                Both parties have submitted
              </p>
              <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">
                Final Review Meeting opens on{" "}
                <span className="font-semibold text-gray-600">
                  {new Date(appraisal.final_review_date).toLocaleDateString(
                    "en-GB",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    },
                  )}
                </span>
              </p>
            </div>
          </div>
        )}
      {/* ── Hidden notice ── */}
      {!bothSubmitted && (
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
                        avg {empAvg.toFixed(1)}
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
                        avg {supAvg.toFixed(1)}
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
                Promotion Readiness
              </p>
              <p className="text-xs sm:text-sm font-bold text-blue-800">
                {PROMOTION_LABELS[appraisal.promotion_readiness] ??
                  appraisal.promotion_readiness}
              </p>
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
}: {
  viewer: ViewerContext;
  onNavigateToForm?: (appraisalId?: string) => void;
  onNavigateToFinalReview?: (appraisalId: string) => void;
}) {
  const [selected, setSelected] = useState<Appraisal | null>(null);
  const [cycleFilter, setCycleFilter] = useState<"" | "quarterly" | "annual">(
    "",
  );

  const viewerIsSupervisor = isSupervisorGrade(viewer.gradeLevel);

  const queryParams = new URLSearchParams();
  // Employees only see their own appraisals
  if (!viewerIsSupervisor && viewer.companyId) {
    queryParams.set("company_id", viewer.companyId);
  }
  if (cycleFilter) queryParams.set("cycle", cycleFilter);

  const { data, isLoading, isError } = useQuery<Appraisal[]>({
    queryKey: ["appraisals", viewer.gradeLevel, viewer.companyId, cycleFilter],
    queryFn: async () => {
      const res = await api.get(
        `/appraisal/get_appraisal?${queryParams.toString()}`,
      );
      return res.data.data ?? [];
    },
  });

  const appraisals = data ?? [];

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
            {viewerIsSupervisor
              ? "Appraisals for your team"
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
        {(["", "quarterly", "annual"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCycleFilter(c)}
            className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border-2 transition-all whitespace-nowrap ${
              cycleFilter === c
                ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
          >
            {c === "" ? "All" : c === "quarterly" ? "Quarterly" : "Annual"}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-xs sm:text-sm">Loading appraisals...</span>
        </div>
      )}

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
              : "Your supervisor will initiate your first review"}
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
