"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  CalendarRange,
  Lock,
  Clock,
  PenLine,
  Users,
  ShieldCheck,
  ShieldAlert,
  Award,
  Info,
  CircleDot,
  Check,
  Archive,
  ArchiveRestore,
  Loader2,
} from "lucide-react";
import {
  SectionRatings,
  bandFor,
  bandLabel,
  itemRatingMeta,
  ITEM_RATING_MAX,
} from "@/lib/appraisal/scoring";
import { appraisalSideFor } from "@/lib/appraisal/roles";
import {
  canArchiveAppraisal,
  hasFullAppraisalAccess,
} from "@/lib/accessControl";
import { DeadlineBanner } from "./DeadlineBanner";
import { StatusBadge } from "./AppraisalStatusBadge";
import {
  PROMOTION_LABELS,
  formatDate,
  formatDateTime,
  getStatusSummary,
  periodLabel,
  reviewedBy,
  type Appraisal,
  type Justification,
  type StatusTone,
  type ViewerContext,
} from "./appraisalTypes";

/** Raw item ratings are 1–5; returns the section average as a 0–100% score. */
function sectionAvg(sectionRatings: SectionRatings): number | null {
  const vals = Object.values(sectionRatings)
    .map((r) => r.rating)
    .filter((r): r is number => r !== null && r !== undefined);
  if (!vals.length) return null;
  const avgRaw = vals.reduce((a, b) => a + b, 0) / vals.length;
  return (avgRaw / ITEM_RATING_MAX) * 100;
}

function RatingCell({
  rating,
  hidden,
  showLabels,
}: {
  rating: number | null;
  hidden: boolean;
  showLabels: boolean;
}) {
  if (hidden) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-300 text-xs font-mono select-none">
        <Lock className="w-3 h-3" /> •••
      </span>
    );
  }
  if (rating == null) return <span className="text-gray-300 text-xs">—</span>;
  if (!showLabels) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
        {rating}/5
      </span>
    );
  }
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

function CommentCell({ comment, hidden }: { comment: string; hidden: boolean }) {
  if (hidden)
    return (
      <span className="text-gray-200 text-xs font-mono select-none">••••••••</span>
    );
  if (!comment) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className="text-xs text-gray-500 italic block break-words">{comment}</span>
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
      <p className={`text-xl sm:text-2xl font-black ${color}`}>{score.toFixed(1)}</p>
      <p className="text-white/30 text-[10px] sm:text-xs">%</p>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <p className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-xs sm:text-sm text-gray-800 mt-0.5 break-words">
        {value === null || value === undefined || value === "" ? "—" : value}
      </p>
    </div>
  );
}

const STATUS_PANEL_TONES: Record<StatusTone, string> = {
  neutral: "bg-gray-50 border-gray-200",
  amber: "bg-amber-50 border-amber-200",
  blue: "bg-blue-50 border-blue-200",
  emerald: "bg-emerald-50 border-emerald-200",
  red: "bg-red-50 border-red-200",
  purple: "bg-purple-50 border-purple-200",
};

function TimelineStep({
  title,
  timestamp,
  note,
  by,
  done,
}: {
  title: string;
  timestamp?: string | null;
  note?: string;
  /** Name of the person who completed this step, when it is recorded. */
  by?: string | null;
  done: boolean;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
            done ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-300"
          }`}
        >
          {done ? <Check className="w-3 h-3" /> : <CircleDot className="w-3 h-3" />}
        </span>
        <span className="w-px flex-1 bg-gray-200 last:hidden" />
      </div>
      <div className="pb-4 min-w-0">
        <p
          className={`text-xs sm:text-sm font-medium ${
            done ? "text-gray-800" : "text-gray-400"
          }`}
        >
          {title}
        </p>
        <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">
          {done ? formatDateTime(timestamp) : (note ?? "Pending")}
        </p>
        {done && by && (
          <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
            by {by}
          </p>
        )}
      </div>
    </li>
  );
}

export default function AppraisalDetail({
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
  const statusSummary = getStatusSummary(appraisal);

  // Which side of THIS record the viewer occupies. Everyone owns their own
  // self-assessment; the supervisor side needs a strictly senior grade (L4+).
  const side = appraisalSideFor(viewer, appraisal);
  const viewerIsEmployee = side === "employee";
  const viewerIsSupervisor = side === "supervisor";

  const hideEmployeeRatings = !bothSubmitted && !viewerIsEmployee;
  const hideSupervisorRatings = !bothSubmitted && !viewerIsSupervisor;
  const showScoreDetails = appraisal.status === "final_reviewed";

  const employeeRatings = appraisal.employee_ratings ?? {};
  const supervisorRatings = appraisal.supervisor_ratings ?? {};
  const allSectionKeys = Array.from(
    new Set([...Object.keys(employeeRatings), ...Object.keys(supervisorRatings)]),
  );

  const getSectionItems = (sectionKey: string): string[] => {
    const empItems = Object.keys(employeeRatings[sectionKey] ?? {});
    const supItems = Object.keys(supervisorRatings[sectionKey] ?? {});
    return Array.from(new Set([...empItems, ...supItems]));
  };

  // Archiving files a record away: it stays readable but nothing can act on it.
  // Managers / Super Admins can archive; Admins only when Manage User grants
  // Edit on Appraisal.
  const isArchived = !!appraisal.archived;
  const viewerCanArchive = canArchiveAppraisal(
    viewer.role,
    viewer.pagePermissionLevels,
  );

  const canEmployeeFill =
    !isArchived &&
    viewerIsEmployee &&
    appraisal.status !== "locked" &&
    appraisal.status !== "reopened" &&
    appraisal.submitted_by !== "employee" &&
    appraisal.submitted_by !== "both";

  const canSupervisorFill =
    !isArchived &&
    viewerIsSupervisor &&
    appraisal.status !== "locked" &&
    appraisal.status !== "final_reviewed" &&
    (appraisal.status === "reopened"
      ? appraisal.submitted_by === "employee"
      : appraisal.submitted_by !== "supervisor" &&
        appraisal.submitted_by !== "both");

  const showCTA = canEmployeeFill || canSupervisorFill;

  const canSubmitJustification =
    !isArchived &&
    appraisal.status === "locked" &&
    appraisal.locked_reason === "supervisor_incomplete" &&
    !appraisal.appeal_exhausted &&
    (viewer.userId === appraisal.supervisor_id ||
      hasFullAppraisalAccess(viewer.role, viewer.gradeLevel));

  const queryClient = useQueryClient();
  const { mutate: setArchived, isPending: archivePending } = useMutation({
    mutationFn: async (archived: boolean) => {
      const res = await api.post(`/appraisal/${appraisal.id}/archive`, {
        archived,
      });
      return res.data;
    },
    onSuccess: (_data, archived) => {
      toast.success(
        archived
          ? "Appraisal archived. It is hidden from the default list and can no longer be edited."
          : "Appraisal restored.",
      );
      queryClient.invalidateQueries({
        queryKey: ["appraisal", String(appraisal.id)],
      });
      queryClient.invalidateQueries({ queryKey: ["appraisals"] });
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Could not update this appraisal. Please try again.";
      toast.error(message);
    },
  });

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

  const employeeSubmitted =
    appraisal.submitted_by === "employee" || bothSubmitted;
  const supervisorSubmitted =
    appraisal.submitted_by === "supervisor" || bothSubmitted;

  const narrativeFields = [
    { label: "Strengths Observed", value: appraisal.strengths_observed },
    { label: "Improvement Areas", value: appraisal.improvement_areas },
    { label: "Agreed Actions", value: appraisal.agreed_actions },
    { label: "Employee Comments", value: appraisal.employee_comments },
    {
      label: "Most Significant Achievement",
      value: appraisal.most_significant_achievement,
    },
    {
      label: "Development Plan (Next Year)",
      value: appraisal.development_plan_next_year,
    },
    {
      label: "Promotion Readiness Assessment",
      value: appraisal.promotion_readiness_assessment,
    },
    {
      label: "Compensation Review Input",
      value: appraisal.compensation_review_input,
    },
  ].filter((f) => !!f.value);

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
              <StatusBadge
                status={appraisal.status}
                submittedBy={appraisal.submitted_by}
                lockedReason={appraisal.locked_reason}
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
              {reviewedBy(appraisal) && (
                <span className="truncate">
                  · Reviewed by: {reviewedBy(appraisal)}
                </span>
              )}
            </p>
          </div>

          <div className="flex gap-2 sm:gap-4 bg-white/10 rounded-xl p-3 sm:p-4 justify-between sm:justify-start w-full lg:w-auto">
            <ScoreDisplay
              score={appraisal.employee_weighted_score ?? null}
              hidden={!showScoreDetails}
              label="Employee Score"
            />
            <div className="w-px bg-white/10" />
            <ScoreDisplay
              score={appraisal.supervisor_weighted_score ?? null}
              hidden={!showScoreDetails}
              label="Supervisor Score"
            />
            {showScoreDetails && appraisal.final_quarter_score != null && (
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

        {appraisal.status === "final_reviewed" &&
          appraisal.final_quarter_score != null && (
            <div className="mt-4 bg-white/10 rounded-lg px-3 py-2 flex items-center gap-2 text-xs sm:text-sm">
              <Award className="w-4 h-4 text-white/60 shrink-0" />
              <span className="text-white/60">Performance band:</span>
              <span className="font-semibold">
                {bandLabel(appraisal.final_quarter_score)}
              </span>
            </div>
          )}

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

      {/* ── Status summary ── */}
      <div
        className={`rounded-xl border p-4 ${STATUS_PANEL_TONES[statusSummary.tone]}`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <StatusBadge
            status={appraisal.status}
            submittedBy={appraisal.submitted_by}
            lockedReason={appraisal.locked_reason}
          />
          <span className="text-xs sm:text-sm font-semibold text-gray-800">
            Current status
          </span>
        </div>
        <p className="text-[11px] sm:text-xs text-gray-600 leading-relaxed">
          {statusSummary.description}
        </p>
        {statusSummary.nextStep && (
          <p className="text-[11px] sm:text-xs text-gray-700 mt-1.5">
            <strong>Next:</strong> {statusSummary.nextStep}
          </p>
        )}
      </div>

      {/* ── Archive banner / control ── */}
      {(isArchived || viewerCanArchive) && (
        <div
          className={`rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            isArchived
              ? "bg-slate-100 border-slate-300"
              : "bg-white border-gray-200"
          }`}
        >
          <div className="flex items-start gap-3">
            <Archive
              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                isArchived ? "text-slate-500" : "text-gray-300"
              }`}
            />
            <div>
              <p className="text-xs sm:text-sm font-semibold text-gray-800">
                {isArchived ? "This appraisal is archived" : "Archive"}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
                {isArchived
                  ? `Archived${
                      appraisal.archived_by_name
                        ? ` by ${appraisal.archived_by_name}`
                        : ""
                    }${
                      appraisal.archived_at
                        ? ` on ${formatDateTime(appraisal.archived_at)}`
                        : ""
                    }. It is hidden from the default list, frozen against edits, and skipped by deadline reminders.`
                  : "Filing this away hides it from the default list and stops all edits and reminders. Nothing is deleted — you can restore it at any time."}
              </p>
            </div>
          </div>
          {viewerCanArchive && (
            <button
              onClick={() => setArchived(!isArchived)}
              disabled={archivePending}
              className={`w-full md:w-auto flex-shrink-0 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-60 ${
                isArchived
                  ? "bg-[#1e3a5f] text-white hover:bg-[#16304f]"
                  : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {archivePending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isArchived ? (
                <ArchiveRestore className="w-4 h-4" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              {isArchived ? "Restore appraisal" : "Archive appraisal"}
            </button>
          )}
        </div>
      )}

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
                {statusSummary.description}
              </p>
              {appraisal.locked_at && (
                <p className="text-[11px] sm:text-xs text-red-500 mt-1">
                  Locked on {formatDateTime(appraisal.locked_at)}
                </p>
              )}
              {appraisal.appeal_exhausted && (
                <p className="text-[11px] sm:text-xs text-red-500 mt-1">
                  The appeal for this appraisal has been used — no further
                  justifications can be submitted.
                </p>
              )}
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
          <p className="text-[11px] sm:text-xs text-gray-400 mt-1">
            Submitted {formatDateTime(latestJustification.created_at)}
          </p>
          {latestJustification.reviewed_by_name && (
            <p className="text-[11px] sm:text-xs text-gray-600 mt-1">
              <strong>Reviewed by {latestJustification.reviewed_by_name}</strong>
              {latestJustification.reviewed_at
                ? ` · ${formatDate(latestJustification.reviewed_at)}`
                : ""}
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
                    Review both scores together, discuss any differences, and
                    lock in the final agreed score.
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

      {/* ── Appraisal details ── */}
      <div className="space-y-3">
        <h3 className="text-xs sm:text-sm font-bold text-gray-800">
          Appraisal Details
        </h3>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
          <DetailField label="Employee" value={appraisal.employee_name} />
          <DetailField label="Company ID" value={appraisal.company_id} />
          <DetailField label="Job Title" value={appraisal.job_title} />
          <DetailField label="Current Grade" value={appraisal.current_grade} />
          <DetailField
            label="Cycle"
            value={
              appraisal.cycle
                ? appraisal.cycle.charAt(0).toUpperCase() + appraisal.cycle.slice(1)
                : appraisal.review_quarter === "Q4"
                  ? "Annual"
                  : "Quarterly"
            }
          />
          <DetailField label="Review Period" value={periodLabel(appraisal)} />
          <DetailField
            label="Period Covered"
            value={appraisal.period_covered}
          />
          <DetailField
            label="Supervisor"
            value={appraisal.immediate_supervisor}
          />
          <DetailField
            label="Supervisor Email"
            value={appraisal.supervisor_email}
          />
          <DetailField
            label="Evaluation Completed By"
            value={appraisal.supervisor_reviewed_by_name}
          />
          <DetailField
            label="Final Review Signed Off By"
            value={appraisal.final_reviewed_by_name}
          />
          <DetailField
            label="Employee Email"
            value={appraisal.employee_email}
          />
          <DetailField
            label="Reviewing Manager"
            value={appraisal.reviewing_manager}
          />
          <div className="col-span-2 lg:col-span-3">
            <DetailField
              label="Section / Authorisations Held"
              value={appraisal.section_authorisations_held}
            />
          </div>
        </div>
      </div>

      {/* ── Progress timeline ── */}
      <div className="space-y-3">
        <h3 className="text-xs sm:text-sm font-bold text-gray-800">Progress</h3>
        <ol className="bg-white rounded-xl border border-gray-200 p-4">
          <TimelineStep
            title="Appraisal created"
            timestamp={appraisal.created_at}
            done
          />
          <TimelineStep
            title="Employee self-assessment submitted"
            timestamp={appraisal.employee_submitted_at}
            done={employeeSubmitted}
            note="Awaiting the employee"
          />
          <TimelineStep
            title="Supervisor evaluation submitted"
            timestamp={appraisal.supervisor_submitted_at}
            done={supervisorSubmitted}
            by={appraisal.supervisor_reviewed_by_name}
            note="Awaiting the supervisor"
          />
          {appraisal.status === "locked" && (
            <TimelineStep
              title="Locked after missed deadline"
              timestamp={appraisal.locked_at}
              done
            />
          )}
          {appraisal.status === "reopened" && (
            <TimelineStep
              title="Reopened after approved justification"
              done
              note={
                appraisal.reopened_deadline_at
                  ? `Closes ${formatDate(appraisal.reopened_deadline_at)}`
                  : undefined
              }
              timestamp={appraisal.reopened_deadline_at}
            />
          )}
          <TimelineStep
            title="Final review meeting completed"
            timestamp={appraisal.final_reviewed_at ?? appraisal.final_review_date}
            done={appraisal.status === "final_reviewed"}
            by={appraisal.final_reviewed_by_name}
            note={
              appraisal.final_review_date
                ? `Scheduled for ${formatDate(appraisal.final_review_date)}`
                : "Not scheduled"
            }
          />
          {isArchived && (
            <TimelineStep
              title="Archived"
              timestamp={appraisal.archived_at}
              by={appraisal.archived_by_name}
              done
            />
          )}
        </ol>
        {!!appraisal.employee_penalty_points && (
          <p className="text-[11px] sm:text-xs text-red-600">
            {appraisal.employee_penalty_points} penalty point
            {appraisal.employee_penalty_points === 1 ? "" : "s"} applied to the
            employee for this appraisal.
          </p>
        )}
      </div>

      {!showScoreDetails && bothSubmitted && appraisal.status !== "locked" && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[11px] sm:text-xs text-blue-800">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="leading-snug">
            Percentage scores and performance bands are hidden until the final
            review meeting. Individual 1–5 ratings are shown below for
            discussion.
          </span>
        </div>
      )}

      {/* ── Hidden notice ── */}
      {!bothSubmitted && appraisal.status !== "locked" && (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[11px] sm:text-xs text-gray-500">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="leading-snug">
            {viewerIsEmployee
              ? "Supervisor ratings are hidden until both parties have submitted."
              : viewerIsSupervisor
                ? "Employee ratings are hidden until both parties have submitted."
                : "Both sides' ratings are hidden until the employee and their supervisor have submitted."}
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
            const empAvg =
              showScoreDetails && !hideEmployeeRatings
                ? sectionAvg(empSecRatings)
                : null;
            const supAvg =
              showScoreDetails && !hideSupervisorRatings
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
                            showLabels={showScoreDetails}
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
                            showLabels={showScoreDetails}
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

      {/* ── Final review outcome ── */}
      {appraisal.status === "final_reviewed" &&
        (appraisal.final_review_notes || appraisal.final_reviewed_by_name) && (
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-gray-800">
              Final Review Meeting
            </h3>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              {appraisal.final_reviewed_by_name && (
                <p className="text-xs sm:text-sm text-emerald-800 font-semibold flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  Reviewed by {appraisal.final_reviewed_by_name}
                  {appraisal.final_reviewed_at && (
                    <span className="font-normal text-emerald-600">
                      · {formatDateTime(appraisal.final_reviewed_at)}
                    </span>
                  )}
                </p>
              )}
              {appraisal.final_review_notes && (
                <>
                  <p className="text-[10px] sm:text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1.5">
                    Discussion notes
                  </p>
                  <p className="text-xs sm:text-sm text-gray-700 leading-relaxed break-words">
                    {appraisal.final_review_notes}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

      {/* ── Comments (both submitted) ── */}
      {bothSubmitted && (
        <div className="space-y-3">
          <h3 className="text-xs sm:text-sm font-bold text-gray-800">
            Comments &amp; Development
          </h3>
          {narrativeFields.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {narrativeFields.map(({ label, value }) => (
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
              ))}
            </div>
          )}

          {appraisal.review_quarter === "Q4" && appraisal.promotion_readiness && (
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
                    employee&apos;s profile for the result.
                  </p>
                </div>
              </div>
            )}
        </div>
      )}

      <p className="text-[10px] sm:text-xs text-gray-300 text-right pb-2">
        Created {formatDate(appraisal.created_at)}
      </p>
    </div>
  );
}
