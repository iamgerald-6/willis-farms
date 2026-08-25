"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Archive, FileText, PenLine } from "lucide-react";
import { Quarter, canAppraiseOthers } from "@/lib/appraisal/sections";
import {
  getActiveAppraisalPeriod,
  periodLabel as activePeriodLabel,
} from "@/lib/appraisal/deadlines";
import {
  canArchiveAppraisal,
  canViewAllAppraisalPeriods,
  hasFullAppraisalAccess,
  isSuperAdmin,
} from "@/lib/accessControl";
import { TableSkeleton } from "@/components/skeletons/PageSkeletons";
import { StatusBadge } from "./AppraisalStatusBadge";
import {
  formatDate,
  periodLabel,
  reviewedBy,
  type Appraisal,
} from "./appraisalTypes";

export type { Appraisal, ViewerContext } from "./appraisalTypes";

import type { ViewerContext } from "./appraisalTypes";

// "All periods" itself now doubles as the "all quarters" view (quarterFilter
// resets to "" when it's clicked) — these pills are only for drilling down
// into one specific quarter from there, so there's no separate "All" pill.
// Kept local rather than the module registry's QUARTER_FILTERS/
// getQuarterFilterLabel, which include a redundant "" (All) entry and still
// label Q4 as "Q4 (Annual)" instead of "Annual".
const QUARTER_FILTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

function quarterFilterLabel(q: "" | Quarter) {
  if (q === "") return "All";
  return q === "Q4" ? "Annual" : q;
}

function detailHref(a: Appraisal) {
  return `/dashboard/humanCapital/appraisal/${a.id}`;
}

/** Final quarter score only — shown after the final review meeting. */
function headlineScore(a: Appraisal): number | null {
  if (a.status === "final_reviewed" && a.final_quarter_score != null) {
    return a.final_quarter_score;
  }
  return null;
}

function ScoreCell({ appraisal }: { appraisal: Appraisal }) {
  const score = headlineScore(appraisal);
  if (score == null) {
    return <span className="text-gray-300">—</span>;
  }
  return (
    <span className="font-semibold text-gray-900">
      {score.toFixed(1)}%
      {appraisal.status === "final_reviewed" && (
        <span className="block text-xs font-normal text-gray-400">Final</span>
      )}
    </span>
  );
}

function ArchivedTag() {
  return (
    <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
      <Archive className="w-3 h-3" />
      Archived
    </span>
  );
}

function AppraisalCard({ appraisal }: { appraisal: Appraisal }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">
            {appraisal.employee_name}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {appraisal.job_title}
          </p>
          {appraisal.archived && <ArchivedTag />}
        </div>
        <StatusBadge
          status={appraisal.status}
          submittedBy={appraisal.submitted_by}
          lockedReason={appraisal.locked_reason}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-400">Period</p>
          <p className="font-medium text-gray-700 mt-0.5">
            {periodLabel(appraisal)}
          </p>
        </div>
        <div>
          <p className="text-gray-400">Type</p>
          <p className="font-medium text-gray-700 mt-0.5">
            {appraisal.review_quarter === "Q4" ? "Annual" : "Quarterly"}
          </p>
        </div>
        <div>
          <p className="text-gray-400">Grade Band</p>
          <p className="font-medium text-gray-700 mt-0.5">
            {appraisal.grade_band}
          </p>
        </div>
        <div>
          <p className="text-gray-400">Score</p>
          <p className="font-medium text-gray-700 mt-0.5">
            <ScoreCell appraisal={appraisal} />
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-gray-400">Reviewed by</p>
          <p className="font-medium text-gray-700 mt-0.5">
            {reviewedBy(appraisal) ?? "—"}
          </p>
        </div>
        {appraisal.final_review_date && (
          <div className="col-span-2">
            <p className="text-gray-400">Final Review Meeting</p>
            <p className="font-medium text-gray-700 mt-0.5">
              {formatDate(appraisal.final_review_date)}
            </p>
          </div>
        )}
      </div>

      <Link
        href={detailHref(appraisal)}
        className="block w-full py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition text-center"
      >
        View details
      </Link>
    </div>
  );
}

export default function AppraisalLandingPage({
  viewer,
  onNavigateToForm,
}: {
  viewer: ViewerContext;
  onNavigateToForm?: (appraisalId?: string) => void;
}) {
  // Default to the single applicable period so the list matches the form.
  const activePeriod = getActiveAppraisalPeriod();
  const [quarterFilter, setQuarterFilter] = useState<"" | Quarter>(
    activePeriod.quarter,
  );
  const [yearFilter] = useState(activePeriod.year);
  const [showArchived, setShowArchived] = useState(false);
  const [showAllPeriods, setShowAllPeriods] = useState(false);

  // Full access (Manager/Admin/Super Admin/L5+) sees everyone; everyone
  // else sees only their own appraisal data (spec Section 4).
  const viewerHasFullAccess = hasFullAppraisalAccess(
    viewer.role,
    viewer.gradeLevel,
  );
  // Only Manager / Admin / Super Admin may browse past periods. Employees
  // (any grade) are locked to the current applicable period.
  const canBrowsePeriods = canViewAllAppraisalPeriods(viewer.role);
  const canArchive = canArchiveAppraisal(
    viewer.role,
    viewer.pagePermissionLevels,
  );
  // Employees never leave the current period — ignore any stale toggle state.
  const viewingAllPeriods = canBrowsePeriods && showAllPeriods;
  const viewingArchived = canBrowsePeriods && showArchived;

  const queryParams = new URLSearchParams();
  if (!viewerHasFullAccess && viewer.companyId) {
    queryParams.set("company_id", viewer.companyId);
  }
  if (!viewingAllPeriods) {
    queryParams.set("review_quarter", activePeriod.quarter);
    queryParams.set("review_year", String(activePeriod.year));
  } else if (quarterFilter) {
    queryParams.set("review_quarter", quarterFilter);
  }
  if (viewingArchived) queryParams.set("archived", "true");

  const { data, isLoading, isError } = useQuery<Appraisal[]>({
    queryKey: [
      "appraisals",
      viewer.gradeLevel,
      viewer.companyId,
      quarterFilter,
      yearFilter,
      viewingArchived,
      viewingAllPeriods,
      activePeriod.quarter,
      activePeriod.year,
    ],
    queryFn: async () => {
      const res = await api.get(
        `/appraisal/get_appraisal?${queryParams.toString()}`,
      );
      return res.data.data ?? [];
    },
  });

  const appraisals = data ?? [];
  // L4+ can also appraise people below them; everyone else only ever fills
  // their own self-assessment.
  const viewerCanAppraiseOthers =
    canAppraiseOthers(viewer.gradeLevel) || isSuperAdmin(viewer.role);
  const emptyMessage = viewerCanAppraiseOthers
    ? "Start a new appraisal using the button above"
    : "Complete your self-assessment using the button above";

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      {/* ── Header ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Performance Appraisals
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {viewingArchived
              ? "Archived appraisals — read-only"
              : viewingAllPeriods
                ? viewerHasFullAccess
                  ? "All periods across the organisation"
                  : "All of your appraisal periods"
                : `Showing ${activePeriodLabel(activePeriod.quarter, activePeriod.year)}${
                    activePeriod.inGracePeriod
                      ? " (completion window open)"
                      : ""
                  }`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateToForm?.()}
            className="bg-red-600 text-white flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium shadow-sm flex-shrink-0"
          >
            <PenLine className="w-4 h-4" />
            {viewerCanAppraiseOthers ? "New Appraisal" : "My Appraisal Form"}
          </button>
        </div>
      </div>

      {/* ── Filter tabs (period browsing is Manager/Admin only) ── */}
      <div className="flex gap-2 mb-5 flex-wrap items-center">
        {canBrowsePeriods ? (
          <>
            <button
              onClick={() => {
                setShowAllPeriods(false);
                setQuarterFilter(activePeriod.quarter);
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition border ${
                !viewingAllPeriods
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
              }`}
            >
              Current period
            </button>
            <button
              onClick={() => {
                setShowAllPeriods(true);
                setQuarterFilter("");
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition border ${
                viewingAllPeriods
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
              }`}
            >
              All periods
            </button>
            {viewingAllPeriods &&
              QUARTER_FILTERS.map((q) => (
                <button
                  key={q || "all"}
                  onClick={() => setQuarterFilter(q)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition border ${
                    quarterFilter === q
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
                  }`}
                >
                  {quarterFilterLabel(q)}
                </button>
              ))}
            <span className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />
            <button
              onClick={() => setShowArchived((prev) => !prev)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition border flex items-center gap-1.5 ${
                viewingArchived
                  ? "bg-slate-700 text-white border-slate-700"
                  : "bg-white text-gray-600 border-gray-200 hover:border-slate-400"
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              {viewingArchived ? "Viewing archived" : "Archived"}
            </button>
            {viewer.role === "admin" && !canArchive && (
              <span className="text-xs text-gray-400">
                Archiving requires Edit on Appraisal in Manage User
              </span>
            )}
          </>
        ) : (
          <span className="px-4 py-1.5 rounded-full text-sm font-medium border bg-red-600 text-white border-red-600">
            {activePeriodLabel(activePeriod.quarter, activePeriod.year)}
          </span>
        )}
      </div>

      {isError && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-red-500 text-sm">
          Failed to load appraisals. Please try again.
        </div>
      )}

      {!isError && isLoading && <TableSkeleton rows={6} cols={8} />}

      {!isError && !isLoading && (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {appraisals.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
                {viewingArchived
                  ? "No archived appraisals."
                  : "No appraisals found."}
              </div>
            ) : (
              appraisals.map((a) => <AppraisalCard key={a.id} appraisal={a} />)
            )}
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
                    Period
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Type
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Grade Band
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Score
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Reviewed By
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
                {appraisals.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-16 text-center text-gray-400"
                    >
                      <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">
                        {viewingArchived
                          ? "No archived appraisals"
                          : "No appraisals yet"}
                      </p>
                      <p className="text-xs mt-1 opacity-60">
                        {viewingArchived
                          ? "Archived appraisals will appear here once you file one away"
                          : emptyMessage}
                      </p>
                    </td>
                  </tr>
                ) : (
                  appraisals.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {a.employee_name}
                        </p>
                        <p className="text-xs text-gray-400">{a.job_title}</p>
                        {a.archived && <ArchivedTag />}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {periodLabel(a)}
                        {a.final_review_date && (
                          <span className="block text-xs text-gray-400">
                            Review {formatDate(a.final_review_date)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            a.review_quarter === "Q4"
                              ? "bg-purple-50 text-purple-600"
                              : "bg-blue-50 text-blue-600"
                          }`}
                        >
                          {a.review_quarter === "Q4" ? "Annual" : "Quarterly"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {a.grade_band}
                      </td>
                      <td className="px-4 py-3">
                        <ScoreCell appraisal={a} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {reviewedBy(a) ?? (
                          <span className="text-gray-300">—</span>
                        )}
                        {a.final_reviewed_by_name && (
                          <span className="block text-xs text-gray-400">
                            Signed off
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={a.status}
                          submittedBy={a.submitted_by}
                          lockedReason={a.locked_reason}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={detailHref(a)}
                          className="inline-block px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition font-medium whitespace-nowrap"
                        >
                          View details
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
