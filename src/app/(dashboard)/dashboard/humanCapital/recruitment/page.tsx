"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  PANEL_DECISIONS,
  isAiFlagged,
  type ApplicationStatus,
  type JobApplication,
  type PanelDecision,
} from "@/lib/careers/types";
import {
  canHrChangeStatus,
  getAllowedHrStatusOptions,
  isAwaitingAiScreening,
  validateHrStatusChange,
} from "@/lib/careers/applicationStatusRules";
import InterviewPanelForm from "./components/InterviewPanelForm";
import ApplicationFormReview from "./components/ApplicationFormReview";
import OnboardingTab from "./components/OnboardingTab";
import CareersTab from "./components/CareersTab";
import {
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { PageShell, PageHeaderSkeleton, ListRowsSkeleton } from "@/components/skeletons/PageSkeletons";
import { isFullRoleAccess } from "@/lib/pagePermissions";

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  applied: "bg-blue-50 text-blue-700 border border-blue-200",
  under_review: "bg-amber-50 text-amber-700 border border-amber-200",
  shortlisted: "bg-purple-50 text-purple-700 border border-purple-200",
  interview: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  hold: "bg-orange-50 text-orange-700 border border-orange-200",
  onboarding: "bg-teal-50 text-teal-700 border border-teal-200",
  offer: "bg-green-50 text-green-700 border border-green-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
};

const AI_RECOMMENDATION_LABELS: Record<string, string> = {
  hire: "Hire",
  hold: "Hold / reserve",
  do_not_hire: "Do not hire",
};

const AI_RECOMMENDATION_CLASSES: Record<string, string> = {
  hire: "bg-green-100 text-green-800",
  hold: "bg-amber-100 text-amber-800",
  do_not_hire: "bg-red-100 text-red-800",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const INTERVIEW_GUIDE_STATUSES: ApplicationStatus[] = [
  "interview",
  "hold",
  "onboarding",
  "offer",
];

function ApplicationDetail({
  application,
  onClose,
  onUpdated,
  onRefreshApplication,
  adminId,
  openInterviewOnMount,
  onInterviewOpened,
}: {
  application: JobApplication;
  onClose: () => void;
  onUpdated: () => void;
  onRefreshApplication: () => Promise<void>;
  adminId: string;
  openInterviewOnMount?: boolean;
  onInterviewOpened?: () => void;
}) {
  const [status, setStatus] = useState<ApplicationStatus>(application.status);
  const [hrNotes, setHrNotes] = useState(application.hr_notes ?? "");
  const [selectedDecision, setSelectedDecision] = useState<PanelDecision | "">(
    application.interview_form_data?.summary?.decision ?? "",
  );
  const [showInterview, setShowInterview] = useState(
    openInterviewOnMount ?? false,
  );

  useEffect(() => {
    if (openInterviewOnMount) {
      setShowInterview(true);
      onInterviewOpened?.();
    }
  }, [openInterviewOnMount, onInterviewOpened]);

  useEffect(() => {
    setStatus(application.status);
    setHrNotes(application.hr_notes ?? "");
    setSelectedDecision(application.interview_form_data?.summary?.decision ?? "");
  }, [application]);

  const allowedStatusOptions = useMemo(
    () => getAllowedHrStatusOptions(application) ?? [],
    [application],
  );
  const awaitingAiScreening = isAwaitingAiScreening(application);
  const statusEditable = canHrChangeStatus(application);
  const canOpenInterviewGuide = INTERVIEW_GUIDE_STATUSES.includes(application.status);

  const decision = application.interview_form_data?.summary?.decision;
  const decisionLabel = PANEL_DECISIONS.find((d) => d.value === decision)?.label;
  const decisionConfirmed = application.interview_form_data?.summary?.decision_confirmed_at;
  const canConfirmOutcome =
    !!application.interview_submitted_at && !decisionConfirmed;

  const confirmMutation = useMutation({
    mutationFn: () =>
      api.post("/careers/interview", {
        application_id: application.id,
        interview_form_data: {
          ...application.interview_form_data,
          summary: {
            ...application.interview_form_data?.summary,
            decision: selectedDecision,
          },
        },
        submitted_by: adminId,
        action: "confirm_decision",
      }),
    onSuccess: (res) => {
      const warnings = res.data.email_warnings as string[] | undefined;
      if (warnings?.length) {
        toast.warning(`Confirmed, but: ${warnings.join("; ")}`);
      } else {
        toast.success("Outcome confirmed.");
      }
      onUpdated();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Confirm failed.");
    },
  });

  const resendOnboarding = useMutation({
    mutationFn: () =>
      api.post("/careers/onboarding/resend", { application_id: application.id }),
    onSuccess: (res) => {
      if (res.data.email_warning) {
        toast.warning(res.data.email_warning);
      } else {
        toast.success("Onboarding link resent.");
      }
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Resend failed.");
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: {
      id: string;
      status?: ApplicationStatus;
      hr_notes?: string;
    }) => api.patch("/careers/applications", payload),
    onSuccess: () => {
      toast.success("Application updated.");
      onUpdated();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Update failed.");
    },
  });

  const screenMutation = useMutation({
    mutationFn: () =>
      api.post("/careers/applications/screen", { application_id: application.id }),
    onSuccess: (res) => {
      const screening = res.data.screening as { status: string; score: number };
      toast.success(
        screening.status === "shortlisted"
          ? `Shortlisted by AI (${screening.score}% match). Review the application, then move to Interview when ready.`
          : `Sent to Rejects for your review (${screening.score}% match).`,
      );
      void onRefreshApplication();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "AI shortlisting failed.");
    },
  });

  const save = () => {
    if (status !== application.status) {
      const validationError = validateHrStatusChange(application, status);
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }
    mutation.mutate({
      id: application.id,
      status,
      hr_notes: hrNotes,
    });
  };

  // Shortlisted applications get two direct-action buttons (Reject /
  // Interview) instead of the general status dropdown — no separate "Save
  // changes" click needed, the decision applies immediately. Uses its own
  // mutation (rather than `mutation` above) so the modal stays open and
  // refreshes in place afterward, instead of closing — moving to Interview
  // should immediately make "Open interview guide" available.
  const quickStatusMutation = useMutation({
    mutationFn: (next: ApplicationStatus) =>
      api.patch("/careers/applications", {
        id: application.id,
        status: next,
        hr_notes: hrNotes,
      }),
    onSuccess: async (_res, next) => {
      toast.success(
        next === "rejected"
          ? "Moved to Rejects."
          : "Moved to Interview — you can now open the interview guide.",
      );
      await onRefreshApplication();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Update failed.");
    },
  });

  const applyQuickStatus = (next: ApplicationStatus) => {
    const validationError = validateHrStatusChange(application, next);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    quickStatusMutation.mutate(next);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-40 p-0 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {application.full_name}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Ref {application.reference_number} · Applied{" "}
                {formatDate(application.created_at)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Role</p>
                <p className="font-medium text-gray-900 mt-1">
                  {application.role_title}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
                <span
                  className={`inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[application.status]}`}
                >
                  {STATUS_LABELS[application.status]}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Email</p>
                <a
                  href={`mailto:${application.email}`}
                  className="font-medium text-red-600 hover:underline mt-1 block"
                >
                  {application.email}
                </a>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Phone</p>
                <p className="font-medium text-gray-900 mt-1">{application.phone}</p>
              </div>
              {application.location && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">
                    Location
                  </p>
                  <p className="font-medium text-gray-900 mt-1">
                    {application.location}
                  </p>
                </div>
              )}
            </div>

            {application.cv_url && (
              <a
                href={application.cv_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline"
              >
                <FileText className="w-4 h-4" />
                View CV
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {application.application_form_data && (
              <ApplicationFormReview formData={application.application_form_data} />
            )}

            {application.ai_screening && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/80 p-4">
                <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide mb-1">
                  AI screening — {application.ai_screening.score}% match
                </p>
                <p className="text-sm text-purple-900">{application.ai_screening.summary}</p>
                <p className="text-xs text-purple-500 mt-2">
                  Screened {formatDate(application.ai_screening.screened_at)}
                </p>
              </div>
            )}

            {awaitingAiScreening && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 space-y-3">
                <p className="text-sm text-blue-900">
                  This application is waiting for AI shortlisting. Run it now to review the
                  candidate, or wait for the daily batch.
                </p>
                <button
                  type="button"
                  onClick={() => screenMutation.mutate()}
                  disabled={screenMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-60"
                >
                  {screenMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    "Generate shortlisting"
                  )}
                </button>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Update status
              </label>
              {application.status === "offer" ? (
                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  {STATUS_LABELS.offer} — set automatically when an offer is made.
                </p>
              ) : awaitingAiScreening ? (
                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  {STATUS_LABELS.applied} — status unlocks after AI shortlisting.
                </p>
              ) : !statusEditable ? (
                <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  {STATUS_LABELS[application.status]}
                </p>
              ) : application.status === "shortlisted" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => applyQuickStatus("rejected")}
                    disabled={quickStatusMutation.isPending}
                    className="flex-1 py-2.5 border border-red-200 bg-red-50 text-red-700 text-sm font-medium rounded-lg hover:bg-red-100 disabled:opacity-60"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickStatus("interview")}
                    disabled={quickStatusMutation.isPending}
                    className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                  >
                    Interview
                  </button>
                </div>
              ) : application.status === "interview" ? (
                <button
                  type="button"
                  onClick={() => applyQuickStatus("rejected")}
                  disabled={quickStatusMutation.isPending}
                  className="w-full py-2.5 border border-red-200 bg-red-50 text-red-700 text-sm font-medium rounded-lg hover:bg-red-100 disabled:opacity-60"
                >
                  Reject
                </button>
              ) : (
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  {allowedStatusOptions.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              )}
              {application.status === "shortlisted" && statusEditable && (
                <p className="text-xs text-gray-500 mt-2">
                  Reject to send this application to the Rejects tab, or move to Interview to
                  open the interview guide.
                </p>
              )}
              {application.status === "under_review" && application.ai_screening && (
                <p className="text-xs text-gray-500 mt-2">
                  Shortlist to override the AI recommendation, or confirm Rejected.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                HR notes (internal)
              </label>
              <textarea
                value={hrNotes}
                onChange={(e) => setHrNotes(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Screening notes, interview scheduling, etc."
              />
            </div>

            {application.interview_submitted_at && application.interview_form_data && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-2">
                <p className="text-sm font-semibold text-indigo-900">
                  Interview evaluation results
                </p>
                {application.interview_form_data.summary?.stage1_average != null && (
                  <p className="text-xs text-indigo-800">
                    Stage 1 average:{" "}
                    <strong>
                      {application.interview_form_data.summary.stage1_average.toFixed(2)}
                    </strong>
                  </p>
                )}
                {application.interview_form_data.summary?.stage2_average != null && (
                  <p className="text-xs text-indigo-800">
                    Stage 2 average:{" "}
                    <strong>
                      {application.interview_form_data.summary.stage2_average.toFixed(2)}
                    </strong>
                  </p>
                )}
                {application.interview_form_data.summary?.total_weighted != null && (
                  <p className="text-xs text-indigo-800">
                    Combined score:{" "}
                    <strong>
                      {application.interview_form_data.summary.total_weighted.toFixed(2)}
                    </strong>
                  </p>
                )}
                {application.interview_form_data.summary?.ai_analysis && (
                  <div className="mt-2 pt-2 border-t border-indigo-100 space-y-1.5">
                    <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide">
                      AI analysis
                    </p>
                    <p className="text-xs text-indigo-900 leading-relaxed">
                      {application.interview_form_data.summary.ai_analysis}
                    </p>
                    {application.interview_form_data.summary.ai_recommendation && (
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          AI_RECOMMENDATION_CLASSES[
                            application.interview_form_data.summary.ai_recommendation
                          ]
                        }`}
                      >
                        AI recommends:{" "}
                        {
                          AI_RECOMMENDATION_LABELS[
                            application.interview_form_data.summary.ai_recommendation
                          ]
                        }
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-indigo-700/80 mt-2">
                  Review scores and discuss as a team before confirming an outcome.
                </p>
              </div>
            )}

            {application.interview_form_data?.stage1_review?.reviewed_at &&
              application.interview_form_data.stage1_review.passed === false && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  Rejected at Stage 1 review (
                  {application.interview_form_data.stage1_review.average_score?.toFixed(2) ?? "—"}{" "}
                  average)
                </p>
              )}

            {canConfirmOutcome && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-900">
                  Confirm interview outcome
                </p>
                <p className="text-xs text-amber-800">
                  Interview evaluation is complete. Choose an outcome after your team discussion.
                  {application.interview_form_data?.summary?.total_weighted != null && (
                    <>
                      {" "}
                      Combined score:{" "}
                      {application.interview_form_data.summary.total_weighted.toFixed(2)}
                    </>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {PANEL_DECISIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setSelectedDecision(d.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                        selectedDecision === d.value
                          ? "bg-amber-800 text-white border-amber-800"
                          : "bg-white text-gray-700 border-gray-200 hover:border-amber-300"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                {selectedDecision && (
                  <p className="text-xs text-amber-700">
                    {selectedDecision === "hire"
                      ? "Confirming hire sends a congratulations email with a 7-day onboarding link."
                      : selectedDecision === "hold"
                        ? "Hold does not send a candidate email."
                        : "Confirming rejection sends a professional decline email."}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => confirmMutation.mutate()}
                  disabled={confirmMutation.isPending || !selectedDecision}
                  className="w-full py-2.5 bg-amber-700 text-white text-sm font-medium rounded-lg hover:bg-amber-800 disabled:opacity-60"
                >
                  {confirmMutation.isPending
                    ? "Confirming…"
                    : selectedDecision
                      ? `Confirm: ${PANEL_DECISIONS.find((d) => d.value === selectedDecision)?.label}`
                      : "Select an outcome to confirm"}
                </button>
              </div>
            )}

            {decisionConfirmed && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                Outcome confirmed {formatDate(decisionConfirmed)}
                {decisionLabel ? ` · ${decisionLabel}` : ""}
              </p>
            )}

            {application.status === "onboarding" && decision === "hire" && (
              <button
                type="button"
                onClick={() => resendOnboarding.mutate()}
                disabled={resendOnboarding.isPending}
                className="w-full py-2 border border-teal-200 bg-teal-50 text-teal-800 text-sm font-medium rounded-lg hover:bg-teal-100 disabled:opacity-60"
              >
                {resendOnboarding.isPending ? "Sending…" : "Resend onboarding link"}
              </button>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={save}
                disabled={mutation.isPending}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {mutation.isPending ? "Saving…" : "Save changes"}
              </button>
              {canOpenInterviewGuide && (
                <button
                  type="button"
                  onClick={() => setShowInterview(true)}
                  className="flex-1 py-2.5 border border-red-200 bg-red-50 text-red-700 text-sm font-medium rounded-lg hover:bg-red-100"
                >
                  Open interview guide
                </button>
              )}
            </div>

            {application.interview_submitted_at && (
              <p className="text-xs text-gray-400">
                Interview submitted{" "}
                {formatDate(application.interview_submitted_at)}
                {application.interview_form_data?.summary?.total_weighted !=
                  null && (
                  <>
                    {" "}
                    · Score{" "}
                    {application.interview_form_data.summary.total_weighted}
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {showInterview && (
        <InterviewPanelForm
          applicationId={application.id}
          adminId={adminId}
          onClose={() => setShowInterview(false)}
          onSaved={onUpdated}
          onInterviewSubmitted={async () => {
            setShowInterview(false);
            await onRefreshApplication();
          }}
        />
      )}
    </>
  );
}

// ─── Multi-select filter dropdown ──────────────────────────────────────────────
// Replaces free-text search: click the field's button, pick any number of
// values from the list of what's actually present in the data, values from
// different fields combine (AND), values within the same field combine (OR).
function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition ${
          selected.length > 0
            ? "bg-red-50 text-red-700 border-red-200"
            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-2.5 pt-2.5 pb-1.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 focus-within:border-red-400">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1.5 px-1.5">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-3 text-sm text-gray-400">No matches</p>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm cursor-pointer hover:bg-gray-50 ${checked ? "bg-red-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt.value)}
                      className="accent-red-600 w-3.5 h-3.5 shrink-0"
                    />
                    <span className="flex-1 min-w-0 truncate text-gray-800">
                      {opt.label}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className="border-t border-gray-100 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-semibold text-gray-400 hover:text-red-600"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 bg-red-50 text-red-700 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full">
      {label}
      <button type="button" onClick={onRemove} className="hover:text-red-900">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// Applications the AI screened below threshold (status "under_review"), plus
// any HR has since confirmed "rejected" — kept here for the record.
function RejectsTab({
  applications,
  isLoading,
  onSelect,
}: {
  applications: JobApplication[];
  isLoading: boolean;
  onSelect: (application: JobApplication) => void;
}) {
  const pending = applications.filter((a) => a.status === "under_review");
  const confirmed = applications.filter((a) => a.status === "rejected");

  const renderRow = (a: JobApplication) => (
    <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50/80">
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900">{a.full_name}</p>
        <p className="text-xs text-gray-400">{a.email}</p>
      </td>
      <td className="px-4 py-3 text-gray-700">{a.role_title}</td>
      <td className="px-4 py-3">
        {a.ai_screening ? (
          <div>
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              {a.ai_screening.score}% match
            </span>
            <p className="text-xs text-gray-500 mt-1 max-w-sm line-clamp-2">
              {a.ai_screening.summary}
            </p>
          </div>
        ) : (
          <span className="text-xs text-gray-400">No score</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}
        >
          {STATUS_LABELS[a.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={() => onSelect(a)}
          className="text-xs font-medium text-red-600 hover:underline"
        >
          Review
        </button>
      </td>
    </tr>
  );

  const renderTable = (rows: JobApplication[], emptyLabel: string) => (
    <div className="overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
      <table className="w-full text-left text-sm min-w-[800px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 font-semibold text-gray-600">Candidate</th>
            <th className="px-4 py-3 font-semibold text-gray-600">Role</th>
            <th className="px-4 py-3 font-semibold text-gray-600">AI screening</th>
            <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
            <th className="px-4 py-3 font-semibold text-gray-600 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td colSpan={5} className="px-4 py-3">
                  <div className="h-4 bg-gray-100 animate-pulse rounded w-full" />
                </td>
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map(renderRow)
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
        Applications the AI scored below the shortlist threshold land here for HR review.
        Open each one and either shortlist it if you disagree with the AI, or confirm
        Rejected — confirmed rejects stay listed here rather than being deleted.
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Awaiting your review ({pending.length})
        </h3>
        {renderTable(pending, "Nothing waiting on your review.")}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Confirmed rejects ({confirmed.length})
        </h3>
        {renderTable(confirmed, "No confirmed rejects yet.")}
      </div>
    </div>
  );
}

function RecruitmentPageContent() {
  const searchParams = useSearchParams();
  const interviewParam = searchParams?.get("interview");
  const tabParam = searchParams?.get("tab");
  const [activeTab, setActiveTab] = useState<
    "applications" | "onboarding" | "careers" | "ai_rejects"
  >(
    tabParam === "onboarding"
      ? "onboarding"
      : tabParam === "careers"
        ? "careers"
        : tabParam === "ai_rejects" || tabParam === "rejects"
          ? "ai_rejects"
          : "applications",
  );

  const [nameFilters, setNameFilters] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [selected, setSelected] = useState<JobApplication | null>(null);
  const [autoOpenInterviewId, setAutoOpenInterviewId] = useState<
    string | null
  >(null);
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data as { user_id: string; role: string }[];
    },
  });

  const currentUser = allUsers.find((u) => u.user_id === session?.user?.id);
  const role =
    currentUser?.role ??
    (session?.user?.user_metadata?.role as string | undefined) ??
    "";

  const isHr = isFullRoleAccess(role);

  const { data, isLoading } = useQuery({
    queryKey: ["job_applications"],
    queryFn: async () => {
      const res = await api.get("/careers/applications");
      return res.data.data as JobApplication[];
    },
    enabled: isHr,
  });

  // AI soft-rejects and HR-confirmed rejects live in the Rejects tab.
  const mainApplications = useMemo(
    () => (data ?? []).filter((a) => !isAiFlagged(a)),
    [data],
  );
  const aiRejectApplications = useMemo(
    () => (data ?? []).filter(isAiFlagged),
    [data],
  );

  // Cross-filtering: each field's option list is scoped by the OTHER active
  // filters (never by itself) — so picking Status = Interview narrows what
  // shows up under Name/Role to only candidates actually in that status.
  const applyFilters = (
    list: JobApplication[],
    opts: { name?: string[]; role?: string[]; status?: string[] },
  ) =>
    list.filter((a) => {
      if (opts.name && opts.name.length > 0 && !opts.name.includes(a.full_name))
        return false;
      if (opts.role && opts.role.length > 0 && !opts.role.includes(a.role_title))
        return false;
      if (opts.status && opts.status.length > 0 && !opts.status.includes(a.status))
        return false;
      return true;
    });

  const nameOptions = useMemo(() => {
    const scoped = applyFilters(mainApplications, { role: roleFilters, status: statusFilters });
    return Array.from(new Set(scoped.map((a) => a.full_name)))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n }));
  }, [mainApplications, roleFilters, statusFilters]);

  const roleOptions = useMemo(() => {
    const scoped = applyFilters(mainApplications, { name: nameFilters, status: statusFilters });
    return Array.from(new Set(scoped.map((a) => a.role_title)))
      .sort((a, b) => a.localeCompare(b))
      .map((r) => ({ value: r, label: r }));
  }, [mainApplications, nameFilters, statusFilters]);

  const statusOptions = useMemo(() => {
    const scoped = applyFilters(mainApplications, { name: nameFilters, role: roleFilters });
    const present = new Set(scoped.map((a) => a.status));
    return APPLICATION_STATUSES.filter((s) => present.has(s)).map((s) => ({
      value: s,
      label: STATUS_LABELS[s],
    }));
  }, [mainApplications, nameFilters, roleFilters]);

  const filtered = useMemo(
    () =>
      applyFilters(mainApplications, {
        name: nameFilters,
        role: roleFilters,
        status: statusFilters,
      }),
    [mainApplications, nameFilters, roleFilters, statusFilters],
  );

  const hasActiveFilters =
    nameFilters.length + roleFilters.length + statusFilters.length > 0;

  const clearAllFilters = () => {
    setNameFilters([]);
    setRoleFilters([]);
    setStatusFilters([]);
  };

  const awaitingScreeningCount = (data ?? []).filter(isAwaitingAiScreening).length;

  useEffect(() => {
    if (tabParam === "onboarding") setActiveTab("onboarding");
    else if (tabParam === "careers") setActiveTab("careers");
    else if (tabParam === "ai_rejects" || tabParam === "rejects") setActiveTab("ai_rejects");
  }, [tabParam]);

  useEffect(() => {
    if (!interviewParam || !data?.length || !session?.user?.id) return;
    const app = data.find((a) => a.id === interviewParam);
    if (!app) return;
    if (!INTERVIEW_GUIDE_STATUSES.includes(app.status)) return;
    setSelected(app);
    setAutoOpenInterviewId(app.id);
  }, [interviewParam, data, session?.user?.id]);

  if (!session) {
    return (
      <PageShell>
        <PageHeaderSkeleton />
        <ListRowsSkeleton rows={5} />
      </PageShell>
    );
  }

  if (!isHr) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">
            Recruitment inbox is available to HR admins and managers only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-red-600" />
            Recruitment
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Job applications, panel interviews, and onboarding
          </p>
        </div>
        {awaitingScreeningCount > 0 && activeTab === "applications" && (
          <span className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-xs font-medium w-fit">
            {awaitingScreeningCount} awaiting AI shortlisting
          </span>
        )}
      </div>

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {(["applications", "ai_rejects", "careers", "onboarding"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5 ${
              activeTab === tab
                ? "border-red-600 text-red-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab === "applications"
              ? "Applications"
              : tab === "ai_rejects"
                ? "Rejects"
                : tab === "careers"
                  ? "Careers"
                  : "Onboarding"}
            {tab === "ai_rejects" && aiRejectApplications.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {aiRejectApplications.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "careers" ? (
        <CareersTab />
      ) : activeTab === "ai_rejects" ? (
        <RejectsTab applications={aiRejectApplications} isLoading={isLoading} onSelect={setSelected} />
      ) : activeTab === "onboarding" ? (
        <OnboardingTab />
      ) : (
        <>
      <div className="mb-5">
        <div className="flex flex-wrap gap-2">
          <MultiSelectFilter
            label="Name"
            options={nameOptions}
            selected={nameFilters}
            onChange={setNameFilters}
          />
          <MultiSelectFilter
            label="Role"
            options={roleOptions}
            selected={roleFilters}
            onChange={setRoleFilters}
          />
          <MultiSelectFilter
            label="Status"
            options={statusOptions}
            selected={statusFilters}
            onChange={setStatusFilters}
          />
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {nameFilters.map((n) => (
              <FilterChip
                key={`name-${n}`}
                label={n}
                onRemove={() => setNameFilters(nameFilters.filter((v) => v !== n))}
              />
            ))}
            {roleFilters.map((r) => (
              <FilterChip
                key={`role-${r}`}
                label={r}
                onRemove={() => setRoleFilters(roleFilters.filter((v) => v !== r))}
              />
            ))}
            {statusFilters.map((s) => (
              <FilterChip
                key={`status-${s}`}
                label={STATUS_LABELS[s as ApplicationStatus]}
                onRemove={() => setStatusFilters(statusFilters.filter((v) => v !== s))}
              />
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs font-semibold text-gray-400 hover:text-red-600 px-2"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
        <table className="w-full text-left text-sm min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">Candidate</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Ref</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Applied</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 animate-pulse rounded w-full" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No applications found.
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-gray-100 hover:bg-gray-50/80"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{a.full_name}</p>
                    <p className="text-xs text-gray-400">{a.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{a.role_title}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {a.reference_number}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(a.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(a)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      )}

      {selected && (activeTab === "applications" || activeTab === "ai_rejects") && (
        <ApplicationDetail
          application={selected}
          onClose={() => setSelected(null)}
          adminId={session.user!.id}
          openInterviewOnMount={autoOpenInterviewId === selected.id}
          onInterviewOpened={() => setAutoOpenInterviewId(null)}
          onRefreshApplication={async () => {
            await queryClient.invalidateQueries({ queryKey: ["job_applications"] });
            const res = await api.get("/careers/applications");
            const apps = res.data.data as JobApplication[];
            queryClient.setQueryData(["job_applications"], apps);
            const fresh = apps.find((a) => a.id === selected.id);
            if (fresh) setSelected(fresh);
          }}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["job_applications"] });
            queryClient.invalidateQueries({ queryKey: ["onboarding_submissions"] });
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

export default function RecruitmentPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <PageHeaderSkeleton />
          <ListRowsSkeleton rows={5} />
        </PageShell>
      }
    >
      <RecruitmentPageContent />
    </Suspense>
  );
}
