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
  STATUS_STYLES,
  PANEL_DECISIONS,
  normalizeRoleInterviewReport,
  type ApplicationStatus,
  type JobApplication,
  type PanelDecision,
  type InterviewReport,
  type RoleInterviewReport,
  type RoleInterviewReportRow,
} from "@/lib/careers/types";
import {
  canHrChangeStatus,
  getAllowedHrStatusOptions,
  isAwaitingAiScreening,
  statusChangeRequiresHrNotes,
  validateHrStatusChange,
} from "@/lib/careers/applicationStatusRules";
import InterviewPanelForm from "./components/InterviewPanelForm";
import ApplicationFormReview from "./components/ApplicationFormReview";
import OnboardingTab from "./components/OnboardingTab";
import EmployeesTab from "./components/EmployeesTab";
import CareersTab from "./components/CareersTab";
import Pagination, { PAGE_SIZE } from "./components/Pagination";
import GraderSubmissionModal from "./components/interview/GraderSubmissionModal";
import {
  gradersForStage,
  getSubmission,
  stageDateLabel,
  type GraderResult,
} from "@/lib/careers/panelInterview";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import {
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import {
  PageShell,
  PageHeaderSkeleton,
  ListRowsSkeleton,
} from "@/components/skeletons/PageSkeletons";
import { isFullRoleAccess } from "@/lib/pagePermissions";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import { ACCEPT_PDF_OR_WORD } from "@/lib/uploadConstraints";

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
  "evaluation",
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
  onUpdated: (opts?: { hired?: boolean }) => void;
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
  const [selectedReconsiderDecision, setSelectedReconsiderDecision] = useState<
    "evaluation" | "rejected" | ""
  >("");
  const [showApplicationFormModal, setShowApplicationFormModal] =
    useState(false);
  const [showOriginalReportModal, setShowOriginalReportModal] = useState(false);
  const [showEditedReportModal, setShowEditedReportModal] = useState(false);
  const [showPanelResponses, setShowPanelResponses] = useState(false);
  const [showEvaluationResultsModal, setShowEvaluationResultsModal] =
    useState(false);
  const [selectedGraderView, setSelectedGraderView] = useState<{
    grader: GraderResult;
    stage: 1 | 2;
  } | null>(null);
  const [showInterview, setShowInterview] = useState(
    openInterviewOnMount ?? false,
  );
  const existingReport =
    application.interview_form_data?.summary?.interview_report_edit ??
    application.interview_form_data?.summary?.interview_report ??
    null;
  const [reportDraft, setReportDraft] = useState<InterviewReport | null>(
    existingReport,
  );
  const [reportEmailTo, setReportEmailTo] = useState("info@willsfarms.com");

  useEffect(() => {
    if (openInterviewOnMount) {
      setShowInterview(true);
      onInterviewOpened?.();
    }
  }, [openInterviewOnMount, onInterviewOpened]);

  useEffect(() => {
    setStatus(application.status);
    setHrNotes(application.hr_notes ?? "");
    setSelectedDecision(
      application.interview_form_data?.summary?.decision ?? "",
    );
    setSelectedReconsiderDecision("");
    setReportDraft(existingReport);
    // existingReport is derived fresh from `application` every render — depending on
    // `application` alone (not existingReport, which is a new object identity each
    // render) is what actually gates this to real data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application]);

  // Fetched only once "View all panel responses" is opened — same endpoint
  // the interview guide itself uses, so the raw stage 1 + stage 2 submissions
  // and their guide config (question text, "look for" hints, etc.) come from
  // one source of truth rather than being duplicated here.
  const { data: panelResponsesData, isLoading: panelResponsesLoading } =
    useQuery({
      queryKey: ["interview_panel_responses", application.id],
      queryFn: async () => {
        const res = await api.get(
          `/careers/interview?application_id=${application.id}`,
        );
        return res.data.data as {
          application: JobApplication;
          guide: InterviewGuideConfig | null;
        };
      },
      enabled: showPanelResponses,
    });

  // The consolidated hiring summary for this applicant's role (generated
  // from the Approvals tab) — surfaced here so HR reviewing a single
  // applicant can also jump to the comprehensive report covering everyone
  // who applied for the same role. Cheap GET, so no need to gate it behind
  // a specific status — it simply renders nothing if none exists yet.
  const { data: roleReportRow } = useQuery({
    queryKey: [
      "role_interview_report",
      application.job_posting_id ?? application.role_slug,
    ],
    queryFn: async () => {
      const params = application.job_posting_id
        ? `job_posting_id=${application.job_posting_id}`
        : `role_slug=${application.role_slug}`;
      const res = await api.get(`/careers/interview/role-report?${params}`);
      return res.data.data as RoleInterviewReportRow | null;
    },
    enabled: !!(application.job_posting_id || application.role_slug),
  });

  const allowedStatusOptions = useMemo(
    () => getAllowedHrStatusOptions(application) ?? [],
    [application],
  );
  const awaitingAiScreening = isAwaitingAiScreening(application);
  const statusEditable = canHrChangeStatus(application);
  const canOpenInterviewGuide = INTERVIEW_GUIDE_STATUSES.includes(
    application.status,
  );

  const decision = application.interview_form_data?.summary?.decision;
  const decisionLabel = PANEL_DECISIONS.find(
    (d) => d.value === decision,
  )?.label;
  const decisionConfirmed =
    application.interview_form_data?.summary?.decision_confirmed_at;
  const canConfirmOutcome =
    !!application.interview_submitted_at && !decisionConfirmed;
  const hasGeneratedReport =
    !!application.interview_form_data?.summary?.interview_report;
  const hasEditedReport =
    !!application.interview_form_data?.summary?.interview_report_edit;
  const reportEditLog =
    application.interview_form_data?.summary?.interview_report_edit_log ?? [];
  // True only for applicants who already went through the full interview
  // evaluation and were confirmed Hold/Reserve — not for a plain "hold"
  // reached some other way (e.g. directly from Shortlisted). Rejected is a
  // terminal status: it's never reopened for reconsideration, no matter
  // how the rejection came about.
  const canReconsider =
    !!decisionConfirmed && application.status === "hold" && decision === "hold";
  // Once a decision has been confirmed, the report is read-only reference
  // material rather than something to keep editing — shown as links for
  // Hold/Rejected (where it doubles as reconsideration context), Offer, and
  // Onboarding alike. Only "evaluation" still gets the live editable form.
  // Rendered even without a generated report so HR gets an explicit "none
  // generated" note instead of the section silently disappearing.
  const showReportSection =
    !!decisionConfirmed && application.status !== "evaluation";

  const confirmMutation = useMutation({
    mutationFn: async () => {
      // HR notes are required before an outcome can be confirmed here, so
      // persist them alongside the decision rather than relying on the
      // general application-notes save (that field no longer exists once an
      // applicant reaches this step).
      await api.patch("/careers/applications", {
        id: application.id,
        hr_notes: hrNotes,
      });
      return api.post("/careers/interview", {
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
      });
    },
    onSuccess: (res) => {
      const warnings = res.data.email_warnings as string[] | undefined;
      const hired = selectedDecision === "hire";
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

  const reconsiderMutation = useMutation({
    mutationFn: () =>
      api.post("/careers/interview", {
        application_id: application.id,
        interview_form_data: {
          ...application.interview_form_data,
          summary: {
            ...application.interview_form_data?.summary,
            decision:
              selectedReconsiderDecision === "rejected" ? "do_not_hire" : "",
          },
        },
        submitted_by: adminId,
        action: "reconsider_decision",
        reconsider_to: selectedReconsiderDecision,
      }),
    onSuccess: (res) => {
      const warnings = res.data.email_warnings as string[] | undefined;
      if (warnings?.length) {
        toast.warning(`Confirmed, but: ${warnings.join("; ")}`);
      } else {
        toast.success("Outcome updated.");
      }
      onUpdated();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Confirm failed.");
    },
  });

  const resendOnboarding = useMutation({
    mutationFn: () =>
      api.post("/careers/onboarding/resend", {
        application_id: application.id,
      }),
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

  const startOnboarding = useMutation({
    mutationFn: () =>
      api.post("/careers/onboarding/start", {
        application_id: application.id,
        started_by: adminId,
      }),
    onSuccess: (res) => {
      if (res.data.email_warning) {
        toast.warning(`Moved to onboarding, but: ${res.data.email_warning}`);
      } else {
        toast.success("Congratulations email sent — moved to onboarding.");
      }
      onUpdated();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(
        error?.response?.data?.error ?? "Failed to start onboarding.",
      );
    },
  });

  const rescindOffer = useMutation({
    mutationFn: () =>
      api.post("/careers/onboarding/rescind", {
        application_id: application.id,
        rescinded_by: adminId,
      }),
    onSuccess: (res) => {
      if (res.data.email_warning) {
        toast.warning(`Offer rescinded, but: ${res.data.email_warning}`);
      } else {
        toast.success("Offer rescinded — applicant moved to Rejects.");
      }
      onUpdated();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Failed to rescind offer.");
    },
  });

  const offerLetterInputRef = useRef<HTMLInputElement>(null);

  const { data: offerLetterData, refetch: refetchOfferLetter } = useQuery({
    queryKey: ["offer-letter", application.id],
    queryFn: async () => {
      const res = await api.get(
        `/careers/onboarding/offer-letter?application_id=${application.id}`,
      );
      return res.data.data as {
        offer_letter: {
          secure_url: string;
          original_name: string;
        } | null;
      };
    },
    enabled: application.status === "offer",
  });

  const uploadOfferLetter = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadCareersFile(
        file,
        "careers/offer-letters",
        ACCEPT_PDF_OR_WORD,
        "offer_letter",
      );
      await api.patch("/careers/onboarding/offer-letter", {
        application_id: application.id,
        offer_letter: uploaded,
      });
      return uploaded;
    },
    onSuccess: () => {
      toast.success("Offer letter uploaded.");
      void refetchOfferLetter();
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Upload failed.");
    },
  });

  const offerLetter = offerLetterData?.offer_letter ?? null;
  const hasOfferLetter = !!offerLetter?.secure_url;

  const generateReportMutation = useMutation({
    mutationFn: () =>
      api.post("/careers/interview/report/generate", {
        application_id: application.id,
      }),
    onSuccess: async () => {
      toast.success("Interview report generated.");
      await onRefreshApplication();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Report generation failed.");
    },
  });

  const saveReportMutation = useMutation({
    mutationFn: () =>
      api.patch("/careers/interview/report", {
        application_id: application.id,
        report: reportDraft,
        edited_by: adminId,
      }),
    onSuccess: async () => {
      toast.success("Report saved.");
      await onRefreshApplication();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Save failed.");
    },
  });

  const emailReportMutation = useMutation({
    mutationFn: () =>
      api.post("/careers/interview/report/email", {
        application_id: application.id,
        to: reportEmailTo,
      }),
    onSuccess: () => {
      toast.success(`Report emailed to ${reportEmailTo}.`);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Email failed.");
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: {
      id: string;
      status?: ApplicationStatus;
      hr_notes?: string;
      changed_by?: string;
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
      api.post("/careers/applications/screen", {
        application_id: application.id,
      }),
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
      changed_by: adminId,
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
        changed_by: adminId,
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
                <p className="text-xs text-gray-400 uppercase tracking-wide">
                  Role
                </p>
                <p className="font-medium text-gray-900 mt-1">
                  {application.role_title}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">
                  Status
                </p>
                <span
                  className={`inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[application.status]}`}
                >
                  {STATUS_LABELS[application.status]}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">
                  Email
                </p>
                <a
                  href={`mailto:${application.email}`}
                  className="font-medium text-red-600 hover:underline mt-1 block"
                >
                  {application.email}
                </a>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">
                  Phone
                </p>
                <p className="font-medium text-gray-900 mt-1">
                  {application.phone}
                </p>
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

            {(application.cv_url ||
              (application.application_form_data &&
                (application.status === "evaluation" ||
                  application.status === "offer"))) && (
              <div className="flex flex-col items-start gap-2">
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
                {application.application_form_data &&
                  (application.status === "evaluation" ||
                    application.status === "offer") && (
                    <button
                      type="button"
                      onClick={() => setShowApplicationFormModal(true)}
                      className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline"
                    >
                      <FileText className="w-4 h-4" />
                      View job application details
                    </button>
                  )}
              </div>
            )}

            {application.application_form_data &&
              application.status !== "evaluation" &&
              application.status !== "offer" && (
                <ApplicationFormReview
                  formData={application.application_form_data}
                />
              )}

            {application.ai_screening &&
              application.status !== "evaluation" &&
              application.status !== "offer" && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/80 p-4">
                  {application.ai_screening.certificate_validation_summary && (
                    <div className="mb-3 pb-3 border-b border-purple-200">
                      <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide mb-1">
                        Certificate validation summary
                      </p>
                      <p className="text-sm text-purple-900 whitespace-pre-wrap">
                        {application.ai_screening.certificate_validation_summary}
                      </p>
                    </div>
                  )}
                  <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide mb-1">
                    AI job posting screening — {application.ai_screening.score}% match
                  </p>
                  <p className="text-sm text-purple-900">
                    {application.ai_screening.summary}
                  </p>
                  <p className="text-xs text-purple-500 mt-2">
                    Screened {formatDate(application.ai_screening.screened_at)}
                  </p>
                </div>
              )}

            {awaitingAiScreening && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 space-y-3">
                <p className="text-sm text-blue-900">
                  This application is waiting for AI shortlisting. Run it now to
                  review the candidate, or wait for the daily batch.
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

            {!(application.status === "evaluation" && canConfirmOutcome) && (
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
            )}

            {application.status !== "evaluation" &&
              application.status !== "offer" &&
              application.status !== "rejected" &&
              !canReconsider && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                    Update status
                  </label>
                  {awaitingAiScreening ? (
                    <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      {STATUS_LABELS.applied} — status unlocks after AI
                      shortlisting.
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
                        disabled={
                          quickStatusMutation.isPending ||
                          (statusChangeRequiresHrNotes(application.status, "rejected") &&
                            !hrNotes.trim())
                        }
                        className="flex-1 py-2.5 border border-red-200 bg-red-50 text-red-700 text-sm font-medium rounded-lg hover:bg-red-100 disabled:opacity-60"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => applyQuickStatus("interview")}
                        disabled={
                          quickStatusMutation.isPending ||
                          (statusChangeRequiresHrNotes(application.status, "interview") &&
                            !hrNotes.trim())
                        }
                        className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                      >
                        Interview
                      </button>
                    </div>
                  ) : application.status === "interview" ? (
                    <button
                      type="button"
                      onClick={() => applyQuickStatus("rejected")}
                      disabled={
                        quickStatusMutation.isPending ||
                        (statusChangeRequiresHrNotes(application.status, "rejected") &&
                          !hrNotes.trim())
                      }
                      className="px-4 py-1.5 border border-red-200 bg-red-50 text-red-700 text-sm font-medium rounded-lg hover:bg-red-100 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  ) : (
                    <select
                      value={status}
                      onChange={(e) =>
                        setStatus(e.target.value as ApplicationStatus)
                      }
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      {allowedStatusOptions.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  )}
                  {(application.status === "shortlisted" ||
                    application.status === "interview") &&
                    statusEditable &&
                    !hrNotes.trim() && (
                      <p className="text-[11px] text-amber-700 mt-2">
                        Add HR notes above before you can change status.
                      </p>
                    )}
                  {application.status === "shortlisted" && statusEditable && (
                    <p className="text-xs text-gray-500 mt-2">
                      Reject to send this application to the Rejects tab, or
                      move to Interview to open the interview guide.
                    </p>
                  )}
                  {application.status === "under_review" &&
                    application.ai_screening && (
                      <p className="text-xs text-gray-500 mt-2">
                        Shortlist to override the AI recommendation, or confirm
                        Rejected.
                      </p>
                    )}
                  {application.status === "under_review" &&
                    statusEditable &&
                    status !== application.status &&
                    statusChangeRequiresHrNotes(application.status, status) &&
                    !hrNotes.trim() && (
                      <p className="text-[11px] text-amber-700 mt-2">
                        Add HR notes above before saving this status change.
                      </p>
                    )}
                </div>
              )}

            {application.interview_submitted_at &&
              application.interview_form_data && (
                <button
                  type="button"
                  onClick={() => setShowEvaluationResultsModal(true)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline"
                >
                  <FileText className="w-4 h-4" />
                  View evaluation results
                </button>
              )}

            {application.status === "evaluation" && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">
                    Interview Report
                  </p>
                  {reportDraft && (
                    <div className="flex items-center gap-3">
                      {application.interview_form_data?.summary
                        ?.interview_report && (
                        <button
                          type="button"
                          onClick={() => setShowOriginalReportModal(true)}
                          className="text-xs font-medium text-gray-600 hover:underline"
                        >
                          View original AI report
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPanelResponses(true)}
                        className="text-xs font-medium text-gray-600 hover:underline"
                      >
                        View all panel responses
                      </button>
                      <a
                        href={`/api/careers/interview/report/pdf?application_id=${application.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download PDF
                      </a>
                    </div>
                  )}
                </div>

                {!hasGeneratedReport ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                      Generates a comprehensive report — executive summary,
                      applicant &amp; interview details, core competencies, key
                      observations, and a final recommendation. This can only be
                      generated once; after that you can edit it freely.
                    </p>
                    <button
                      type="button"
                      onClick={() => generateReportMutation.mutate()}
                      disabled={generateReportMutation.isPending}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-60"
                    >
                      {generateReportMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        "Generate interview report"
                      )}
                    </button>
                  </div>
                ) : reportDraft ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                        Executive summary
                      </label>
                      <textarea
                        value={reportDraft.executive_summary}
                        onChange={(e) =>
                          setReportDraft({
                            ...reportDraft,
                            executive_summary: e.target.value,
                          })
                        }
                        rows={6}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-justify"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                        Applicant &amp; interview details
                      </label>
                      <p className="text-[11px] text-gray-400 mb-2">
                        Pulled from the system — not editable here.
                      </p>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3">
                        <div className="space-y-1.5">
                          <p>
                            <span className="text-gray-400">Candidate: </span>
                            {reportDraft.applicant_details.name}
                          </p>
                          <p>
                            <span className="text-gray-400">Role: </span>
                            {reportDraft.applicant_details.role}
                          </p>
                          <p>
                            <span className="text-gray-400">Panel: </span>
                            {reportDraft.applicant_details.panel_names.length
                              ? reportDraft.applicant_details.panel_names.join(", ")
                              : "—"}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <p>
                            <span className="text-gray-400">
                              {stageDateLabel(reportDraft.applicant_details.stage1_location_type)}
                              {" (Stage 1): "}
                            </span>
                            {reportDraft.applicant_details.stage1_interview_date
                              ? formatDate(reportDraft.applicant_details.stage1_interview_date)
                              : "—"}
                          </p>
                          {reportDraft.applicant_details.stage1_location && (
                            <p>
                              <span className="text-gray-400">Stage 1 location: </span>
                              {reportDraft.applicant_details.stage1_location}
                            </p>
                          )}
                          <p>
                            <span className="text-gray-400">
                              {stageDateLabel(reportDraft.applicant_details.stage2_location_type)}
                              {" (Stage 2): "}
                            </span>
                            {reportDraft.applicant_details.stage2_interview_date
                              ? formatDate(reportDraft.applicant_details.stage2_interview_date)
                              : "—"}
                          </p>
                          {reportDraft.applicant_details.stage2_location && (
                            <p>
                              <span className="text-gray-400">Stage 2 location: </span>
                              {reportDraft.applicant_details.stage2_location}
                            </p>
                          )}
                          <p>
                            <span className="text-gray-400">Overall rating: </span>
                            {reportDraft.applicant_details.overall_rating != null
                              ? `${reportDraft.applicant_details.overall_rating.toFixed(2)}/5`
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                        Core competencies
                      </label>
                      <div className="space-y-2">
                        {reportDraft.core_competencies.map((c, i) => (
                          <div
                            key={i}
                            className="border border-gray-200 rounded-lg p-3"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs font-semibold text-gray-800">
                                {c.area}
                              </p>
                              <p className="text-xs text-gray-500">
                                {c.score != null
                                  ? `${c.score.toFixed(2)}/5`
                                  : "—"}
                              </p>
                            </div>
                            <textarea
                              value={c.assessment}
                              onChange={(e) => {
                                const next = [...reportDraft.core_competencies];
                                next[i] = {
                                  ...next[i],
                                  assessment: e.target.value,
                                };
                                setReportDraft({
                                  ...reportDraft,
                                  core_competencies: next,
                                });
                              }}
                              rows={4}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-justify"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                          Strengths
                        </label>
                        <div className="space-y-1.5">
                          {reportDraft.key_observations.strengths.map(
                            (s, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className="text-gray-400 text-xs mt-2">
                                  —
                                </span>
                                <textarea
                                  value={s}
                                  onChange={(e) => {
                                    const next = [
                                      ...reportDraft.key_observations.strengths,
                                    ];
                                    next[i] = e.target.value;
                                    setReportDraft({
                                      ...reportDraft,
                                      key_observations: {
                                        ...reportDraft.key_observations,
                                        strengths: next,
                                      },
                                    });
                                  }}
                                  rows={2}
                                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-justify"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next =
                                      reportDraft.key_observations.strengths.filter(
                                        (_, idx) => idx !== i,
                                      );
                                    setReportDraft({
                                      ...reportDraft,
                                      key_observations: {
                                        ...reportDraft.key_observations,
                                        strengths: next,
                                      },
                                    });
                                  }}
                                  className="text-gray-300 hover:text-red-500 mt-2"
                                  title="Remove"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ),
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setReportDraft({
                                ...reportDraft,
                                key_observations: {
                                  ...reportDraft.key_observations,
                                  strengths: [
                                    ...reportDraft.key_observations.strengths,
                                    "",
                                  ],
                                },
                              })
                            }
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            + Add strength
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                          Weaknesses
                        </label>
                        <div className="space-y-1.5">
                          {reportDraft.key_observations.weaknesses.map(
                            (s, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className="text-gray-400 text-xs mt-2">
                                  —
                                </span>
                                <textarea
                                  value={s}
                                  onChange={(e) => {
                                    const next = [
                                      ...reportDraft.key_observations
                                        .weaknesses,
                                    ];
                                    next[i] = e.target.value;
                                    setReportDraft({
                                      ...reportDraft,
                                      key_observations: {
                                        ...reportDraft.key_observations,
                                        weaknesses: next,
                                      },
                                    });
                                  }}
                                  rows={2}
                                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-justify"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next =
                                      reportDraft.key_observations.weaknesses.filter(
                                        (_, idx) => idx !== i,
                                      );
                                    setReportDraft({
                                      ...reportDraft,
                                      key_observations: {
                                        ...reportDraft.key_observations,
                                        weaknesses: next,
                                      },
                                    });
                                  }}
                                  className="text-gray-300 hover:text-red-500 mt-2"
                                  title="Remove"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ),
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setReportDraft({
                                ...reportDraft,
                                key_observations: {
                                  ...reportDraft.key_observations,
                                  weaknesses: [
                                    ...reportDraft.key_observations.weaknesses,
                                    "",
                                  ],
                                },
                              })
                            }
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            + Add weakness
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                        Key observations summary
                      </label>
                      <textarea
                        value={reportDraft.key_observations.summary}
                        onChange={(e) =>
                          setReportDraft({
                            ...reportDraft,
                            key_observations: {
                              ...reportDraft.key_observations,
                              summary: e.target.value,
                            },
                          })
                        }
                        rows={6}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-justify"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                        Final recommendation
                      </label>
                      <div className="flex gap-2 mb-2">
                        {PANEL_DECISIONS.map((d) => (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() =>
                              setReportDraft({
                                ...reportDraft,
                                final_recommendation: {
                                  ...reportDraft.final_recommendation,
                                  decision: d.value,
                                },
                              })
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                              reportDraft.final_recommendation.decision ===
                              d.value
                                ? "bg-gray-900 text-white border-gray-900"
                                : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={reportDraft.final_recommendation.rationale}
                        onChange={(e) =>
                          setReportDraft({
                            ...reportDraft,
                            final_recommendation: {
                              ...reportDraft.final_recommendation,
                              rationale: e.target.value,
                            },
                          })
                        }
                        rows={6}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-justify"
                        placeholder="Rationale"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => saveReportMutation.mutate()}
                        disabled={saveReportMutation.isPending}
                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60"
                      >
                        {saveReportMutation.isPending
                          ? "Saving…"
                          : "Save changes"}
                      </button>
                      <input
                        value={reportEmailTo}
                        onChange={(e) => setReportEmailTo(e.target.value)}
                        placeholder="HR email"
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px]"
                      />
                      <button
                        type="button"
                        onClick={() => emailReportMutation.mutate()}
                        disabled={
                          emailReportMutation.isPending || !reportEmailTo
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        {emailReportMutation.isPending
                          ? "Sending…"
                          : "Email report"}
                      </button>
                    </div>

                    {reportEditLog.length > 0 && (
                      <p className="text-xs text-gray-400">
                        Edited {reportEditLog.length} time
                        {reportEditLog.length === 1 ? "" : "s"} — last saved{" "}
                        {formatDate(
                          reportEditLog[reportEditLog.length - 1].edited_at,
                        )}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {showReportSection && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-900">
                  Interview Report
                </p>
                <p className="text-xs text-gray-500">
                  This applicant&apos;s outcome has already been confirmed, hence,
                  the report is shown as reference links rather than an editable
                  form.
                </p>
                {hasGeneratedReport ? (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowOriginalReportModal(true)}
                      className="text-xs font-medium text-gray-600 hover:underline"
                    >
                      View AI-generated report
                    </button>
                    {hasEditedReport && (
                      <button
                        type="button"
                        onClick={() => setShowEditedReportModal(true)}
                        className="text-xs font-medium text-gray-600 hover:underline"
                      >
                        View HR-edited report
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPanelResponses(true)}
                      className="text-xs font-medium text-gray-600 hover:underline"
                    >
                      View all panel responses
                    </button>
                    <a
                      href={`/api/careers/interview/report/pdf?application_id=${application.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download PDF
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic pt-1">
                    No individual comprehensive report was generated for this
                    candidate.
                  </p>
                )}
                {roleReportRow && (
                  <div className="pt-2 mt-2 border-t border-gray-100">
                    <a
                      href={`/api/careers/interview/role-report/pdf?${
                        application.job_posting_id
                          ? `job_posting_id=${application.job_posting_id}`
                          : `role_slug=${application.role_slug}`
                      }`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download role hiring summary ({application.role_title})
                    </a>
                    <p className="text-xs text-gray-400 mt-1">
                      The consolidated report covering every applicant for this
                      role.
                    </p>
                  </div>
                )}
              </div>
            )}

            {application.status === "evaluation" && canConfirmOutcome && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-900">
                  Confirm interview outcome
                </p>
                <p className="text-xs text-amber-800">
                  Interview evaluation is complete. Choose an outcome after your
                  team discussion.
                  {application.interview_form_data?.summary?.total_weighted !=
                    null && (
                    <>
                      {" "}
                      Combined score:{" "}
                      {application.interview_form_data.summary.total_weighted.toFixed(
                        2,
                      )}
                    </>
                  )}
                </p>
                <div>
                  <label className="text-xs font-semibold text-amber-900 uppercase tracking-wide block mb-1">
                    HR notes *
                  </label>
                  <textarea
                    value={hrNotes}
                    onChange={(e) => setHrNotes(e.target.value)}
                    rows={3}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white"
                    placeholder="Record your team's reasoning before choosing an outcome — required."
                  />
                  {!hrNotes.trim() && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Add HR notes before you can choose an outcome.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {PANEL_DECISIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setSelectedDecision(d.value)}
                      disabled={!hrNotes.trim()}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-40 disabled:cursor-not-allowed ${
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
                      ? "Confirming hire moves this applicant to Offer status in the Offer tab. No email is sent yet — send the congratulations email with the onboarding link from there when you're ready."
                      : selectedDecision === "hold"
                        ? "Hold does not send a candidate email."
                        : "Confirming rejection sends a professional decline email."}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => confirmMutation.mutate()}
                  disabled={
                    confirmMutation.isPending ||
                    !selectedDecision ||
                    !hrNotes.trim()
                  }
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

            {canReconsider && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 space-y-3">
                <p className="text-sm font-semibold text-indigo-900">
                  Reconsider outcome
                </p>
                <p className="text-xs text-indigo-800">
                  This applicant already completed the full interview process
                  and was confirmed{" "}
                  {application.status === "hold"
                    ? "Hold / Reserve"
                    : "Do not hire"}
                  .{" "}
                  {application.status === "hold"
                    ? "Reopen for evaluation to reconsider, or Reject to confirm rejection."
                    : "Reopen for evaluation to reconsider."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedReconsiderDecision("evaluation")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                      selectedReconsiderDecision === "evaluation"
                        ? "bg-indigo-800 text-white border-indigo-800"
                        : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
                    }`}
                  >
                    Reopen for evaluation
                  </button>
                  {application.status === "hold" && (
                    <button
                      type="button"
                      onClick={() => setSelectedReconsiderDecision("rejected")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                        selectedReconsiderDecision === "rejected"
                          ? "bg-indigo-800 text-white border-indigo-800"
                          : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      Reject
                    </button>
                  )}
                </div>
                {selectedReconsiderDecision && (
                  <p className="text-xs text-indigo-700">
                    {selectedReconsiderDecision === "evaluation"
                      ? "Moves this applicant back to Evaluation status so you can make a fresh decision. No email is sent."
                      : "Confirming rejection sends a professional decline email and moves them to Rejected."}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => reconsiderMutation.mutate()}
                  disabled={
                    reconsiderMutation.isPending || !selectedReconsiderDecision
                  }
                  className="w-full py-2.5 bg-indigo-700 text-white text-sm font-medium rounded-lg hover:bg-indigo-800 disabled:opacity-60"
                >
                  {reconsiderMutation.isPending
                    ? "Confirming…"
                    : selectedReconsiderDecision === "evaluation"
                      ? "Confirm: Reopen for evaluation"
                      : selectedReconsiderDecision === "rejected"
                        ? "Confirm: Reject"
                        : "Select an outcome to confirm"}
                </button>
              </div>
            )}

            {application.interview_form_data?.stage1_review?.reviewed_at &&
              application.interview_form_data.stage1_review.passed ===
                false && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  Rejected at Stage 1 review (
                  {application.interview_form_data.stage1_review.average_score?.toFixed(
                    2,
                  ) ?? "—"}{" "}
                  average)
                </p>
              )}

            {decisionConfirmed && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                Outcome confirmed {formatDate(decisionConfirmed)}
                {decisionLabel ? ` · ${decisionLabel}` : ""}
              </p>
            )}

            {application.status === "offer" && decision === "hire" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Offer letter
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Upload the signed offer letter before sending the
                      onboarding link.
                    </p>
                  </div>
                  {hasOfferLetter ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={offerLetter!.secure_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline"
                      >
                        <FileText className="w-4 h-4" />
                        {offerLetter!.original_name || "View offer letter"}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        type="button"
                        onClick={() => offerLetterInputRef.current?.click()}
                        disabled={uploadOfferLetter.isPending}
                        className="text-xs font-medium text-gray-600 hover:text-red-600 disabled:opacity-60"
                      >
                        Replace file
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => offerLetterInputRef.current?.click()}
                      disabled={uploadOfferLetter.isPending}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 disabled:opacity-60"
                    >
                      {uploadOfferLetter.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      Upload offer letter
                    </button>
                  )}
                  <input
                    ref={offerLetterInputRef}
                    type="file"
                    accept={ACCEPT_PDF_OR_WORD}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadOfferLetter.mutate(file);
                      e.target.value = "";
                    }}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => startOnboarding.mutate()}
                    disabled={
                      !hasOfferLetter ||
                      startOnboarding.isPending ||
                      rescindOffer.isPending
                    }
                    className="flex-1 py-2 border border-green-200 bg-green-50 text-green-800 text-sm font-medium rounded-lg hover:bg-green-100 disabled:opacity-60"
                    title={
                      hasOfferLetter
                        ? undefined
                        : "Upload the offer letter first"
                    }
                  >
                    {startOnboarding.isPending
                      ? "Sending…"
                      : "Send congratulations & onboarding link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !confirm(
                          "Rescind this offer? The applicant will be moved to Rejects and sent a decline email.",
                        )
                      ) {
                        return;
                      }
                      rescindOffer.mutate();
                    }}
                    disabled={rescindOffer.isPending || startOnboarding.isPending}
                    className="flex-1 py-2 border border-red-200 bg-red-50 text-red-700 text-sm font-medium rounded-lg hover:bg-red-100 disabled:opacity-60"
                  >
                    {rescindOffer.isPending ? "Rescinding…" : "Rescind offer"}
                  </button>
                </div>
              </div>
            )}

            {application.status === "onboarding" && decision === "hire" && (
              <button
                type="button"
                onClick={() => resendOnboarding.mutate()}
                disabled={resendOnboarding.isPending}
                className="w-full py-2 border border-teal-200 bg-teal-50 text-teal-800 text-sm font-medium rounded-lg hover:bg-teal-100 disabled:opacity-60"
              >
                {resendOnboarding.isPending
                  ? "Sending…"
                  : "Resend onboarding link"}
              </button>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={save}
                disabled={
                  mutation.isPending ||
                  (status !== application.status &&
                    statusChangeRequiresHrNotes(application.status, status) &&
                    !hrNotes.trim())
                }
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

      {showApplicationFormModal && application.application_form_data && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowApplicationFormModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                Job application details
              </h2>
              <button
                type="button"
                onClick={() => setShowApplicationFormModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto min-h-0">
              <ApplicationFormReview
                formData={application.application_form_data}
              />
            </div>
          </div>
        </div>
      )}

      {showEvaluationResultsModal && application.interview_form_data && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowEvaluationResultsModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                Interview evaluation results
              </h2>
              <button
                type="button"
                onClick={() => setShowEvaluationResultsModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto min-h-0 space-y-2">
              {application.interview_form_data.summary?.stage1_average !=
                null && (
                <p className="text-sm text-gray-700">
                  Stage 1 average:{" "}
                  <strong>
                    {application.interview_form_data.summary.stage1_average.toFixed(
                      2,
                    )}
                  </strong>
                </p>
              )}
              {application.interview_form_data.summary?.stage2_average !=
                null && (
                <p className="text-sm text-gray-700">
                  Stage 2 average:{" "}
                  <strong>
                    {application.interview_form_data.summary.stage2_average.toFixed(
                      2,
                    )}
                  </strong>
                </p>
              )}
              {application.interview_form_data.summary?.total_weighted !=
                null && (
                <p className="text-sm text-gray-700">
                  Combined score:{" "}
                  <strong>
                    {application.interview_form_data.summary.total_weighted.toFixed(
                      2,
                    )}
                  </strong>
                </p>
              )}
              {application.interview_form_data.summary?.ai_analysis && (
                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                  <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide">
                    AI analysis
                  </p>
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {application.interview_form_data.summary.ai_analysis}
                  </p>
                  {application.interview_form_data.summary
                    .ai_recommendation && (
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        AI_RECOMMENDATION_CLASSES[
                          application.interview_form_data.summary
                            .ai_recommendation
                        ]
                      }`}
                    >
                      AI recommends:{" "}
                      {
                        AI_RECOMMENDATION_LABELS[
                          application.interview_form_data.summary
                            .ai_recommendation
                        ]
                      }
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showOriginalReportModal &&
        application.interview_form_data?.summary?.interview_report && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowOriginalReportModal(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-base font-bold text-gray-900">
                  Original AI report
                </h2>
                <button
                  type="button"
                  onClick={() => setShowOriginalReportModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto min-h-0">
                <p className="text-xs text-gray-400 mb-4">
                  This is the report exactly as AI generated it — unaffected by
                  any edits made below.
                </p>
                <InterviewReportReadOnly
                  report={
                    application.interview_form_data.summary.interview_report
                  }
                />
              </div>
            </div>
          </div>
        )}

      {showEditedReportModal &&
        application.interview_form_data?.summary?.interview_report_edit && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowEditedReportModal(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-base font-bold text-gray-900">
                  HR-edited report
                </h2>
                <button
                  type="button"
                  onClick={() => setShowEditedReportModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto min-h-0">
                <p className="text-xs text-gray-400 mb-4">
                  This is HR&apos;s most recently saved edit of the report.
                </p>
                <InterviewReportReadOnly
                  report={
                    application.interview_form_data.summary
                      .interview_report_edit
                  }
                />
              </div>
            </div>
          </div>
        )}

      {showPanelResponses && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowPanelResponses(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                All panel responses
              </h2>
              <button
                type="button"
                onClick={() => setShowPanelResponses(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 overflow-y-auto min-h-0">
              {panelResponsesLoading || !panelResponsesData?.guide ? (
                <p className="text-sm text-gray-400 px-3 py-6 text-center">
                  {panelResponsesLoading
                    ? "Loading…"
                    : "No interview guide found for this role."}
                </p>
              ) : (
                ([1, 2] as const).map((stage) => {
                  const graders = gradersForStage(
                    panelResponsesData.application.interview_form_data!,
                    panelResponsesData.guide!,
                    stage,
                  );
                  if (graders.length === 0) return null;
                  return (
                    <div key={stage} className="mb-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">
                        Stage {stage}
                      </p>
                      {graders.map((g) => (
                        <button
                          key={`${stage}-${g.id}`}
                          type="button"
                          onClick={() =>
                            g.submitted_at &&
                            setSelectedGraderView({ grader: g, stage })
                          }
                          disabled={!g.submitted_at}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {g.label}
                            </p>
                            <p className="text-xs text-gray-400">
                              {g.role === "hr" ? "HR" : "Panel member"}
                              {!g.submitted_at && " · Not submitted"}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-gray-700">
                            {g.total != null ? `${g.total.toFixed(2)}/5` : "—"}
                          </p>
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {selectedGraderView &&
        panelResponsesData?.guide &&
        panelResponsesData.application.interview_form_data && (
          <GraderSubmissionModal
            guide={panelResponsesData.guide}
            graderLabel={selectedGraderView.grader.label}
            graderRole={selectedGraderView.grader.role}
            stage={selectedGraderView.stage}
            submission={
              selectedGraderView.grader.role === "hr"
                ? selectedGraderView.stage === 1
                  ? panelResponsesData.application.interview_form_data
                      .hr_submission?.stage1
                  : panelResponsesData.application.interview_form_data
                      .hr_submission?.stage2
                : getSubmission(
                    panelResponsesData.application.interview_form_data,
                    selectedGraderView.grader.id,
                    selectedGraderView.stage,
                  )
            }
            onClose={() => setSelectedGraderView(null)}
          />
        )}
    </>
  );
}

// Read-only rendering of an interview report — used for the "View original
// AI report" comparison modal.
function InterviewReportReadOnly({ report }: { report: InterviewReport }) {
  const decisionLabel = PANEL_DECISIONS.find(
    (d) => d.value === report.final_recommendation.decision,
  )?.label;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Executive summary
        </p>
        <p className="text-sm text-gray-800 text-justify leading-relaxed">
          {report.executive_summary}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Applicant &amp; interview details
        </p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-700">
          <div className="space-y-1.5">
            <p>
              <span className="text-gray-400">Candidate: </span>
              {report.applicant_details.name}
            </p>
            <p>
              <span className="text-gray-400">Role: </span>
              {report.applicant_details.role}
            </p>
            <p>
              <span className="text-gray-400">Panel: </span>
              {report.applicant_details.panel_names.length
                ? report.applicant_details.panel_names.join(", ")
                : "—"}
            </p>
          </div>
          <div className="space-y-1.5">
            <p>
              <span className="text-gray-400">
                {stageDateLabel(report.applicant_details.stage1_location_type)}
                {" (Stage 1): "}
              </span>
              {report.applicant_details.stage1_interview_date
                ? formatDate(report.applicant_details.stage1_interview_date)
                : "—"}
            </p>
            {report.applicant_details.stage1_location && (
              <p>
                <span className="text-gray-400">Stage 1 location: </span>
                {report.applicant_details.stage1_location}
              </p>
            )}
            <p>
              <span className="text-gray-400">
                {stageDateLabel(report.applicant_details.stage2_location_type)}
                {" (Stage 2): "}
              </span>
              {report.applicant_details.stage2_interview_date
                ? formatDate(report.applicant_details.stage2_interview_date)
                : "—"}
            </p>
            {report.applicant_details.stage2_location && (
              <p>
                <span className="text-gray-400">Stage 2 location: </span>
                {report.applicant_details.stage2_location}
              </p>
            )}
            <p>
              <span className="text-gray-400">Overall rating: </span>
              {report.applicant_details.overall_rating != null
                ? `${report.applicant_details.overall_rating.toFixed(2)}/5`
                : "—"}
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Core competencies
        </p>
        <div className="space-y-2">
          {report.core_competencies.map((c, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-800">{c.area}</p>
                <p className="text-xs text-gray-500">
                  {c.score != null ? `${c.score.toFixed(2)}/5` : "—"}
                </p>
              </div>
              <p className="text-xs text-gray-600 text-justify leading-relaxed">
                {c.assessment}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Strengths
          </p>
          <ul className="space-y-1">
            {report.key_observations.strengths.map((s, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-gray-700">
                <span className="text-gray-400">—</span>
                <span className="text-justify">{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Weaknesses
          </p>
          <ul className="space-y-1">
            {report.key_observations.weaknesses.map((s, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-gray-700">
                <span className="text-gray-400">—</span>
                <span className="text-justify">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Key observations summary
        </p>
        <p className="text-sm text-gray-800 text-justify leading-relaxed">
          {report.key_observations.summary}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Final recommendation
        </p>
        <p className="text-sm font-semibold text-gray-900">{decisionLabel}</p>
        <p className="text-sm text-gray-800 text-justify leading-relaxed mt-1">
          {report.final_recommendation.rationale}
        </p>
      </div>
    </div>
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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="flex items-center gap-1 bg-red-50 text-red-700 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full">
      {label}
      <button type="button" onClick={onRemove} className="hover:text-red-900">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// Screening stage: shortlisted, under review, and rejected candidates —
// whatever path got them to that status (AI screening or HR's own call).
// Rows are pre-sorted by the caller into that exact status order.
function ScreeningStageTab({
  applications,
  isLoading,
  onSelect,
}: {
  applications: JobApplication[];
  isLoading: boolean;
  onSelect: (application: JobApplication) => void;
}) {
  const [nameFilters, setNameFilters] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);

  // Same cross-filtering pattern as the Applications tab: each field's
  // option list is scoped by the OTHER active filters (never by itself).
  const applyFilters = (
    list: JobApplication[],
    opts: { name?: string[]; role?: string[]; status?: string[] },
  ) =>
    list.filter((a) => {
      if (opts.name && opts.name.length > 0 && !opts.name.includes(a.full_name))
        return false;
      if (
        opts.role &&
        opts.role.length > 0 &&
        !opts.role.includes(a.role_title)
      )
        return false;
      if (
        opts.status &&
        opts.status.length > 0 &&
        !opts.status.includes(a.status)
      )
        return false;
      return true;
    });

  const nameOptions = useMemo(() => {
    const scoped = applyFilters(applications, {
      role: roleFilters,
      status: statusFilters,
    });
    return Array.from(new Set(scoped.map((a) => a.full_name)))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n }));
  }, [applications, roleFilters, statusFilters]);

  const roleOptions = useMemo(() => {
    const scoped = applyFilters(applications, {
      name: nameFilters,
      status: statusFilters,
    });
    return Array.from(new Set(scoped.map((a) => a.role_title)))
      .sort((a, b) => a.localeCompare(b))
      .map((r) => ({ value: r, label: r }));
  }, [applications, nameFilters, statusFilters]);

  const statusOptions = useMemo(() => {
    const scoped = applyFilters(applications, {
      name: nameFilters,
      role: roleFilters,
    });
    const present = new Set(scoped.map((a) => a.status));
    return APPLICATION_STATUSES.filter((s) => present.has(s)).map((s) => ({
      value: s,
      label: STATUS_LABELS[s],
    }));
  }, [applications, nameFilters, roleFilters]);

  const filtered = useMemo(
    () =>
      applyFilters(applications, {
        name: nameFilters,
        role: roleFilters,
        status: statusFilters,
      }),
    [applications, nameFilters, roleFilters, statusFilters],
  );

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [nameFilters, roleFilters, statusFilters]);
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const hasActiveFilters =
    nameFilters.length + roleFilters.length + statusFilters.length > 0;

  const clearAllFilters = () => {
    setNameFilters([]);
    setRoleFilters([]);
    setStatusFilters([]);
  };

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

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
        Shortlisted, under review, and rejected applicants — in that order.
        Open one to review its AI screening score and details, or to move it
        forward.
      </div>

      <div>
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
                onRemove={() =>
                  setNameFilters(nameFilters.filter((v) => v !== n))
                }
              />
            ))}
            {roleFilters.map((r) => (
              <FilterChip
                key={`role-${r}`}
                label={r}
                onRemove={() =>
                  setRoleFilters(roleFilters.filter((v) => v !== r))
                }
              />
            ))}
            {statusFilters.map((s) => (
              <FilterChip
                key={`status-${s}`}
                label={STATUS_LABELS[s as ApplicationStatus]}
                onRemove={() =>
                  setStatusFilters(statusFilters.filter((v) => v !== s))
                }
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
              <th className="px-4 py-3 font-semibold text-gray-600">
                AI screening
              </th>
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
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 animate-pulse rounded w-full" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  No applications found.
                </td>
              </tr>
            ) : (
              paginated.map(renderRow)
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          totalItems={filtered.length}
        />
      </div>
    </div>
  );
}

// Applications whose interview evaluation has been finalized (status
// "evaluation") — ranked by combined evaluation score (highest first) so HR
// can compare candidates before deciding hire/hold/reject. Ranking is scoped
// per role: candidates only compete for rank against others who applied for
// the same role.
function ApprovalsTab({
  applications,
  holdApplications,
  isLoading,
  onSelect,
  adminId,
}: {
  applications: JobApplication[];
  holdApplications: JobApplication[];
  isLoading: boolean;
  onSelect: (application: JobApplication) => void;
  adminId: string;
}) {
  const [showRoleReport, setShowRoleReport] = useState(false);
  const [showHoldList, setShowHoldList] = useState(false);
  const [nameFilters, setNameFilters] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);

  // Opened-date labels for the round picker below — cheap, cached lookup of
  // every posting so we can show "Pig Farm Manager — opened 30 Aug 2026".
  const { data: postingsLookup } = useQuery({
    queryKey: ["job_postings_opened_dates"],
    queryFn: async () => {
      const res = await api.get("/careers/postings");
      const rows = (res.data.data ?? []) as { id: string; created_at: string }[];
      return new Map(rows.map((p) => [p.id, p.created_at]));
    },
  });

  // A "round" is one specific job posting (job_posting_id) — a role can be
  // posted more than once over time, and each posting is its own hiring
  // round with its own applicants. Only rounds that currently have someone
  // in Evaluation status show up here, since `applications` is already
  // scoped to that status — once a round is fully decided, it naturally
  // drops off this list. Applicants from before job_posting_id existed
  // (legacy, null) are excluded — there's no round to attribute them to.
  const rounds = useMemo(() => {
    const map = new Map<
      string,
      { jobPostingId: string; roleSlug: string; title: string }
    >();
    for (const a of applications) {
      if (!a.job_posting_id) continue;
      if (!map.has(a.job_posting_id)) {
        map.set(a.job_posting_id, {
          jobPostingId: a.job_posting_id,
          roleSlug: a.role_slug,
          title: a.role_title,
        });
      }
    }
    return Array.from(map.values())
      .map((r) => ({
        ...r,
        openedAt: postingsLookup?.get(r.jobPostingId) ?? null,
      }))
      .sort((a, b) => {
        const byTitle = a.title.localeCompare(b.title);
        if (byTitle !== 0) return byTitle;
        return (b.openedAt ?? "").localeCompare(a.openedAt ?? "");
      });
  }, [applications, postingsLookup]);

  const ranked = useMemo(() => {
    const byRole = new Map<string, JobApplication[]>();
    for (const a of applications) {
      const group = byRole.get(a.role_title) ?? [];
      group.push(a);
      byRole.set(a.role_title, group);
    }

    const byScoreDesc = (a: JobApplication, b: JobApplication) => {
      const scoreA = a.interview_form_data?.summary?.total_weighted;
      const scoreB = b.interview_form_data?.summary?.total_weighted;
      if (scoreA == null && scoreB == null) return 0;
      if (scoreA == null) return 1;
      if (scoreB == null) return -1;
      return scoreB - scoreA;
    };

    const rows: { application: JobApplication; rank: number }[] = [];
    for (const role of Array.from(byRole.keys()).sort((a, b) =>
      a.localeCompare(b),
    )) {
      byRole
        .get(role)!
        .sort(byScoreDesc)
        .forEach((a, i) => rows.push({ application: a, rank: i + 1 }));
    }
    return rows;
  }, [applications]);

  // Cross-filtering, same pattern as the Applications/Rejects tabs: each
  // field's option list is scoped by the OTHER active filter. Filtering
  // happens on the already-ranked rows, so rank numbers stay computed from
  // the full role cohort and don't shift just because the view is filtered.
  const nameOptions = useMemo(() => {
    const scoped = roleFilters.length
      ? ranked.filter((r) => roleFilters.includes(r.application.role_title))
      : ranked;
    return Array.from(new Set(scoped.map((r) => r.application.full_name)))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n }));
  }, [ranked, roleFilters]);

  const roleOptions = useMemo(() => {
    const scoped = nameFilters.length
      ? ranked.filter((r) => nameFilters.includes(r.application.full_name))
      : ranked;
    return Array.from(new Set(scoped.map((r) => r.application.role_title)))
      .sort((a, b) => a.localeCompare(b))
      .map((r) => ({ value: r, label: r }));
  }, [ranked, nameFilters]);

  const filteredRanked = useMemo(
    () =>
      ranked.filter(
        (r) =>
          (nameFilters.length === 0 ||
            nameFilters.includes(r.application.full_name)) &&
          (roleFilters.length === 0 ||
            roleFilters.includes(r.application.role_title)),
      ),
    [ranked, nameFilters, roleFilters],
  );

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filteredRanked.length / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [nameFilters, roleFilters]);
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  const paginatedRanked = useMemo(
    () => filteredRanked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredRanked, page],
  );

  const hasActiveFilters = nameFilters.length + roleFilters.length > 0;
  const clearAllFilters = () => {
    setNameFilters([]);
    setRoleFilters([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowHoldList(true)}
            disabled={holdApplications.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:border-gray-400 disabled:opacity-60"
          >
            Hold / Reserve
            {holdApplications.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {holdApplications.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowRoleReport(true)}
            disabled={rounds.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-60"
          >
            Generate role report
          </button>
        </div>
      </div>

      {showHoldList && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4"
          onClick={() => setShowHoldList(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                Hold / Reserve
              </h2>
              <button
                type="button"
                onClick={() => setShowHoldList(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto min-h-0">
              {holdApplications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  No candidates on Hold / Reserve.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {holdApplications.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowHoldList(false);
                          onSelect(a);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-3"
                      >
                        <span>
                          <p className="text-sm font-medium text-gray-900">
                            {a.full_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {a.role_title}
                          </p>
                          <p className="text-xs text-gray-400">
                            Applied {formatDate(a.created_at)}
                          </p>
                        </span>
                        <span className="text-xs font-medium text-red-600">
                          View
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
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
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs font-semibold text-gray-400 hover:text-red-600 px-2"
          >
            Clear all
          </button>
        </div>
      )}

      {showRoleReport && (
        <RoleReportModal
          rounds={rounds}
          adminId={adminId}
          onClose={() => setShowRoleReport(false)}
        />
      )}

      <div className="overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
        <table className="w-full text-left text-sm min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">Rank</th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Candidate
              </th>
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
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 animate-pulse rounded w-full" />
                  </td>
                </tr>
              ))
            ) : filteredRanked.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  {ranked.length === 0
                    ? "No applications awaiting approval."
                    : "No applications match the selected filters."}
                </td>
              </tr>
            ) : (
              paginatedRanked.map(({ application: a, rank }) => (
                <tr
                  key={a.id}
                  className="border-b border-gray-100 hover:bg-gray-50/80"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {rank}
                  </td>
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
                      onClick={() => onSelect(a)}
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
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          totalItems={filteredRanked.length}
        />
      </div>
    </div>
  );
}

// Applicants with a confirmed Hire decision (status "offer") — extended an
// offer but not yet sent the congratulations/onboarding-link email. Sending
// that email (via /careers/onboarding/start) is what moves them into the
// existing Onboarding tab.
function OfferTab({
  applications,
  isLoading,
  onSelect,
}: {
  applications: JobApplication[];
  isLoading: boolean;
  onSelect: (application: JobApplication) => void;
}) {
  const [nameFilters, setNameFilters] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);

  // Cross-filtering, same pattern as the other tabs: each field's option
  // list is scoped by the other active filter.
  const nameOptions = useMemo(() => {
    const scoped = roleFilters.length
      ? applications.filter((a) => roleFilters.includes(a.role_title))
      : applications;
    return Array.from(new Set(scoped.map((a) => a.full_name)))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n }));
  }, [applications, roleFilters]);

  const roleOptions = useMemo(() => {
    const scoped = nameFilters.length
      ? applications.filter((a) => nameFilters.includes(a.full_name))
      : applications;
    return Array.from(new Set(scoped.map((a) => a.role_title)))
      .sort((a, b) => a.localeCompare(b))
      .map((r) => ({ value: r, label: r }));
  }, [applications, nameFilters]);

  const filtered = useMemo(
    () =>
      applications.filter(
        (a) =>
          (nameFilters.length === 0 || nameFilters.includes(a.full_name)) &&
          (roleFilters.length === 0 || roleFilters.includes(a.role_title)),
      ),
    [applications, nameFilters, roleFilters],
  );

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [nameFilters, roleFilters]);
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const hasActiveFilters = nameFilters.length + roleFilters.length > 0;
  const clearAllFilters = () => {
    setNameFilters([]);
    setRoleFilters([]);
  };

  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-800">
        Applicants confirmed Hire land here with an outstanding offer. Open an
        applicant to send the congratulations email with the onboarding link
        (moves them to the Onboarding tab), or to rescind the offer.
      </div>

      <div>
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
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {nameFilters.map((n) => (
              <FilterChip
                key={`name-${n}`}
                label={n}
                onRemove={() =>
                  setNameFilters(nameFilters.filter((v) => v !== n))
                }
              />
            ))}
            {roleFilters.map((r) => (
              <FilterChip
                key={`role-${r}`}
                label={r}
                onRemove={() =>
                  setRoleFilters(roleFilters.filter((v) => v !== r))
                }
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
              <th className="px-4 py-3 font-semibold text-gray-600">
                Candidate
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Ref</th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Offer confirmed
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 animate-pulse rounded w-full" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  {applications.length === 0
                    ? "No applicants with an outstanding offer right now."
                    : "No applicants match the selected filters."}
                </td>
              </tr>
            ) : (
              paginated.map((a) => (
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
                    {a.interview_form_data?.summary?.decision_confirmed_at
                      ? formatDate(
                          a.interview_form_data.summary.decision_confirmed_at,
                        )
                      : "—"}
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
                      type="button"
                      onClick={() => onSelect(a)}
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
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          totalItems={filtered.length}
        />
      </div>
    </div>
  );
}

// Applicants moved to the interview stage (status "interview") — panel
// setup, stage 1/2 forms, and evaluation all happen from the detail modal.
function InterviewTab({
  applications,
  isLoading,
  onSelect,
}: {
  applications: JobApplication[];
  isLoading: boolean;
  onSelect: (application: JobApplication) => void;
}) {
  const [nameFilters, setNameFilters] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);

  // Cross-filtering, same pattern as the other tabs: each field's option
  // list is scoped by the other active filter.
  const nameOptions = useMemo(() => {
    const scoped = roleFilters.length
      ? applications.filter((a) => roleFilters.includes(a.role_title))
      : applications;
    return Array.from(new Set(scoped.map((a) => a.full_name)))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n }));
  }, [applications, roleFilters]);

  const roleOptions = useMemo(() => {
    const scoped = nameFilters.length
      ? applications.filter((a) => nameFilters.includes(a.full_name))
      : applications;
    return Array.from(new Set(scoped.map((a) => a.role_title)))
      .sort((a, b) => a.localeCompare(b))
      .map((r) => ({ value: r, label: r }));
  }, [applications, nameFilters]);

  const filtered = useMemo(
    () =>
      applications.filter(
        (a) =>
          (nameFilters.length === 0 || nameFilters.includes(a.full_name)) &&
          (roleFilters.length === 0 || roleFilters.includes(a.role_title)),
      ),
    [applications, nameFilters, roleFilters],
  );

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [nameFilters, roleFilters]);
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const hasActiveFilters = nameFilters.length + roleFilters.length > 0;
  const clearAllFilters = () => {
    setNameFilters([]);
    setRoleFilters([]);
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
        Applicants in the interview stage. Open one to set up the panel,
        share Stage 1/2 forms, and move through evaluation once forms are in.
      </div>

      <div>
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
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {nameFilters.map((n) => (
              <FilterChip
                key={`name-${n}`}
                label={n}
                onRemove={() =>
                  setNameFilters(nameFilters.filter((v) => v !== n))
                }
              />
            ))}
            {roleFilters.map((r) => (
              <FilterChip
                key={`role-${r}`}
                label={r}
                onRemove={() =>
                  setRoleFilters(roleFilters.filter((v) => v !== r))
                }
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
              <th className="px-4 py-3 font-semibold text-gray-600">
                Candidate
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Ref</th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Applied
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 animate-pulse rounded w-full" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  {applications.length === 0
                    ? "No applicants in the interview stage right now."
                    : "No applicants match the selected filters."}
                </td>
              </tr>
            ) : (
              paginated.map((a) => (
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
                      type="button"
                      onClick={() => onSelect(a)}
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
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          totalItems={filtered.length}
        />
      </div>
    </div>
  );
}

// Consolidated AI hiring summary for one role — combines every candidate's
// funnel progress and (where available) individual interview report into a
// single report HR can generate once, then edit/download/email freely.
function RoleReportModal({
  rounds,
  adminId,
  onClose,
}: {
  rounds: { jobPostingId: string; roleSlug: string; title: string; openedAt: string | null }[];
  adminId: string;
  onClose: () => void;
}) {
  const [selectedPostingId, setSelectedPostingId] = useState(
    rounds[0]?.jobPostingId ?? "",
  );
  const [reportDraft, setReportDraft] = useState<RoleInterviewReport | null>(
    null,
  );
  const [emailTo, setEmailTo] = useState("info@willsfarms.com");
  const [showOriginal, setShowOriginal] = useState(false);

  const selectedRound = rounds.find((r) => r.jobPostingId === selectedPostingId);

  const {
    data: reportRow,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["role_interview_report", selectedPostingId],
    queryFn: async () => {
      const res = await api.get(
        `/careers/interview/role-report?job_posting_id=${selectedPostingId}`,
      );
      return res.data.data as RoleInterviewReportRow | null;
    },
    enabled: !!selectedPostingId,
  });

  useEffect(() => {
    setReportDraft(
      reportRow
        ? normalizeRoleInterviewReport(
            reportRow.report_edit ?? reportRow.report,
          )
        : null,
    );
  }, [reportRow]);

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post("/careers/interview/role-report/generate", {
        job_posting_id: selectedPostingId,
      }),
    onSuccess: async () => {
      toast.success("Role report generated.");
      await refetch();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Report generation failed.");
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch("/careers/interview/role-report", {
        job_posting_id: selectedPostingId,
        report: reportDraft,
        edited_by: adminId,
      }),
    onSuccess: async () => {
      toast.success("Report saved.");
      await refetch();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Save failed.");
    },
  });

  const emailMutation = useMutation({
    mutationFn: () =>
      api.post("/careers/interview/role-report/email", {
        job_posting_id: selectedPostingId,
        to: emailTo,
      }),
    onSuccess: () => {
      toast.success(`Report emailed to ${emailTo}.`);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Email failed.");
    },
  });

  const editLog = reportRow?.report_edit_log ?? [];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">
            Role hiring summary
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto min-h-0 space-y-5">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              Hiring round
            </label>
            <select
              value={selectedPostingId}
              onChange={(e) => setSelectedPostingId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              {rounds.map((r) => (
                <option key={r.jobPostingId} value={r.jobPostingId}>
                  {r.title}
                  {r.openedAt ? ` — opened ${formatDate(r.openedAt)}` : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Only shows rounds that currently have an applicant awaiting a
              decision. Once a round is fully decided, its report stays
              accessible from each applicant&apos;s own page.
            </p>
          </div>

          {isLoading ? (
            <div className="h-32 bg-gray-50 animate-pulse rounded-lg" />
          ) : !reportRow ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Generates a consolidated report for{" "}
                {selectedRound?.title ?? "this round"} — applicant funnel numbers,
                constraints flagged in HR/panel notes, and a final hire
                recommendation based on the current ranking. You can edit it
                freely afterward, and regenerate it again any time the applicant
                pool changes.
              </p>
              <button
                type="button"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-60"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate role report"
                )}
              </button>
            </div>
          ) : reportDraft ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                {reportRow.report_edit && (
                  <button
                    type="button"
                    onClick={() => setShowOriginal(true)}
                    className="text-xs font-medium text-gray-600 hover:underline"
                  >
                    View original AI report
                  </button>
                )}
                <a
                  href={`/api/careers/interview/role-report/pdf?job_posting_id=${selectedPostingId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !confirm(
                        "Regenerate this report from the current applicant pool? Any edits you've made will be discarded.",
                      )
                    ) {
                      return;
                    }
                    generateMutation.mutate();
                  }}
                  disabled={generateMutation.isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:underline disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${generateMutation.isPending ? "animate-spin" : ""}`}
                  />
                  {generateMutation.isPending
                    ? "Regenerating…"
                    : "Regenerate report"}
                </button>
              </div>

              <div className="border border-gray-200 rounded-xl p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Executive summary
                </label>
                <textarea
                  value={reportDraft.executive_summary}
                  onChange={(e) =>
                    setReportDraft({
                      ...reportDraft,
                      executive_summary: e.target.value,
                    })
                  }
                  rows={5}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-justify"
                />
              </div>

              <div className="border border-gray-200 rounded-xl p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  Applicant funnel
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ["Total applicants", reportDraft.funnel.total_applicants],
                    ["Never shortlisted", reportDraft.funnel.never_shortlisted],
                    [
                      "Shortlisted (total)",
                      reportDraft.funnel.shortlisted_total,
                    ],
                    [
                      "Never started interview",
                      reportDraft.funnel.never_started_interview,
                    ],
                    [
                      "Reached Stage 1 only",
                      reportDraft.funnel.reached_stage1_only,
                    ],
                    [
                      "Completed full interview",
                      reportDraft.funnel.completed_full_interview,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label as string}
                      className="bg-gray-50 border border-gray-100 rounded-lg p-3"
                    >
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                        {label}
                      </p>
                      <p className="text-lg font-bold text-gray-900 mt-0.5">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  Constraints noted
                </label>
                <div className="space-y-2">
                  {reportDraft.constraints.map((c, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-gray-400 mt-2">—</span>
                      <textarea
                        value={c}
                        onChange={(e) => {
                          const next = [...reportDraft.constraints];
                          next[i] = e.target.value;
                          setReportDraft({ ...reportDraft, constraints: next });
                        }}
                        rows={2}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-justify"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = reportDraft.constraints.filter(
                            (_, idx) => idx !== i,
                          );
                          setReportDraft({ ...reportDraft, constraints: next });
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setReportDraft({
                        ...reportDraft,
                        constraints: [...reportDraft.constraints, ""],
                      })
                    }
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    + Add constraint
                  </button>
                  {reportDraft.constraints.length === 0 && (
                    <p className="text-xs text-gray-400 italic">None noted.</p>
                  )}
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  Candidate ranking
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Below are the rankings of the candidates.
                </p>
                {reportDraft.candidate_rankings.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    No candidate is currently awaiting a decision for this role.
                  </p>
                ) : (
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    {reportDraft.candidate_rankings.map((c) => (
                      <div
                        key={c.application_id}
                        className="flex items-center gap-3 px-3 py-2 text-sm border-b border-gray-100 last:border-b-0"
                      >
                        <span className="font-bold text-red-600 w-5">
                          {c.rank}
                        </span>
                        <span className="flex-1 text-gray-900">{c.name}</span>
                        <span className="text-xs text-gray-400 w-28">
                          {c.reference_number}
                        </span>
                        <span className="font-semibold text-gray-900 w-16 text-right">
                          {c.combined_score != null
                            ? c.combined_score.toFixed(2)
                            : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  All applicants
                </label>
                {reportDraft.applicant_roster.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    No applicants for this role.
                  </p>
                ) : (
                  <div className="border border-gray-100 rounded-lg overflow-hidden overflow-x-auto">
                    <table className="w-full text-xs min-w-[640px]">
                      <thead>
                        <tr className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                          <th className="text-left font-semibold px-3 py-2">
                            Name
                          </th>
                          <th className="text-left font-semibold px-3 py-2">
                            Stage reached
                          </th>
                          <th className="text-left font-semibold px-3 py-2">
                            Panel
                          </th>
                          <th className="text-left font-semibold px-3 py-2">
                            Date
                          </th>
                          <th className="text-left font-semibold px-3 py-2">
                            Location
                          </th>
                          <th className="text-right font-semibold px-3 py-2">
                            S1
                          </th>
                          <th className="text-right font-semibold px-3 py-2">
                            S2
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportDraft.applicant_roster.map((a) => (
                          <tr
                            key={a.application_id}
                            className="border-t border-gray-100"
                          >
                            <td className="px-3 py-2 text-gray-900">
                              {a.name}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {a.stage_reached}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {a.panel_names.length
                                ? a.panel_names.join(", ")
                                : "—"}
                              {a.unavailable_panel_names?.length ? (
                                <span className="text-amber-600">
                                  {" "}
                                  ({a.unavailable_panel_names.join(", ")} —
                                  couldn&apos;t make it)
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {a.interview_date
                                ? formatDate(a.interview_date)
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {a.location ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-700 text-right">
                              {a.stage1_rating != null
                                ? a.stage1_rating.toFixed(2)
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-700 text-right">
                              {a.stage2_rating != null
                                ? a.stage2_rating.toFixed(2)
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Core competencies
                </label>
                <textarea
                  value={reportDraft.core_competencies_summary}
                  onChange={(e) =>
                    setReportDraft({
                      ...reportDraft,
                      core_competencies_summary: e.target.value,
                    })
                  }
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-justify mb-3"
                />
                {reportDraft.core_competencies_table.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    No candidate is currently awaiting a decision for this role.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {reportDraft.core_competencies_table.map((c) => (
                      <div
                        key={c.application_id}
                        className="border border-gray-100 rounded-lg p-3"
                      >
                        <p className="text-sm font-semibold text-gray-900 mb-2">
                          {c.name}
                        </p>
                        {c.competencies.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">
                            No competency data available.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {c.competencies.map((comp, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 text-xs"
                              >
                                <span className="font-semibold text-gray-900 w-32 flex-shrink-0">
                                  {comp.area}
                                </span>
                                <span className="font-semibold text-red-600 w-14 flex-shrink-0">
                                  {comp.score != null
                                    ? `${comp.score.toFixed(2)} / 5`
                                    : "—"}
                                </span>
                                <span className="text-gray-600">
                                  {comp.assessment || "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Key observations
                </label>
                <textarea
                  value={reportDraft.key_observations_summary}
                  onChange={(e) =>
                    setReportDraft({
                      ...reportDraft,
                      key_observations_summary: e.target.value,
                    })
                  }
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-justify mb-3"
                />
                {reportDraft.key_observations_table.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    No candidate is currently awaiting a decision for this role.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {reportDraft.key_observations_table.map((c) => (
                      <div
                        key={c.application_id}
                        className="border border-gray-100 rounded-lg p-3"
                      >
                        <p className="text-sm font-semibold text-gray-900 mb-2">
                          {c.name}
                        </p>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="font-semibold text-green-700 uppercase tracking-wide mb-1">
                              Strengths
                            </p>
                            {c.strengths.length ? (
                              <ul className="space-y-1">
                                {c.strengths.map((s, i) => (
                                  <li key={i} className="text-gray-700">
                                    — {s}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-gray-400 italic">
                                None noted.
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-amber-700 uppercase tracking-wide mb-1">
                              Weaknesses
                            </p>
                            {c.weaknesses.length ? (
                              <ul className="space-y-1">
                                {c.weaknesses.map((s, i) => (
                                  <li key={i} className="text-gray-700">
                                    — {s}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-gray-400 italic">
                                None noted.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Final recommendation
                </label>
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  {reportDraft.final_recommendation.candidate_name
                    ? `${reportDraft.final_recommendation.candidate_name} (${reportDraft.final_recommendation.reference_number})`
                    : "No candidate currently recommendable"}
                </p>
                <textarea
                  value={reportDraft.final_recommendation.rationale}
                  onChange={(e) =>
                    setReportDraft({
                      ...reportDraft,
                      final_recommendation: {
                        ...reportDraft.final_recommendation,
                        rationale: e.target.value,
                      },
                    })
                  }
                  rows={5}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-justify"
                />
              </div>

              <div className="border border-gray-200 rounded-xl p-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  Appendix — panel forms &amp; individual reports
                </label>
                {reportDraft.candidate_links.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    No applicant has started the interview process yet.
                  </p>
                ) : (
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    {reportDraft.candidate_links.map((c) => (
                      <div
                        key={c.application_id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs border-b border-gray-100 last:border-b-0"
                      >
                        <span className="font-semibold text-gray-900">
                          {c.name}
                        </span>
                        <span className="text-gray-400">
                          {c.reference_number}
                        </span>
                        <a
                          href={c.panel_forms_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-600 hover:underline"
                        >
                          Panel forms
                        </a>
                        {c.individual_report_url ? (
                          <a
                            href={c.individual_report_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-red-600 hover:underline"
                          >
                            Individual report
                          </a>
                        ) : (
                          <span className="text-gray-400 italic">
                            No individual report generated.
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60"
                >
                  {saveMutation.isPending ? "Saving…" : "Save changes"}
                </button>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="Email address"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => emailMutation.mutate()}
                  disabled={emailMutation.isPending || !emailTo}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {emailMutation.isPending ? "Sending…" : "Email report"}
                </button>
              </div>

              {editLog.length > 0 && (
                <p className="text-xs text-gray-400">
                  Edited {editLog.length} time{editLog.length === 1 ? "" : "s"}{" "}
                  — last saved{" "}
                  {formatDate(editLog[editLog.length - 1].edited_at)}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {showOriginal && reportRow?.report && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4"
          onClick={() => setShowOriginal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                Original AI report
              </h2>
              <button
                type="button"
                onClick={() => setShowOriginal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto min-h-0 space-y-3 text-sm text-gray-800">
              <p className="text-xs text-gray-400 mb-2">
                This is the report exactly as AI generated it — unaffected by
                any edits made above.
              </p>
              <p className="whitespace-pre-wrap text-justify">
                {reportRow.report.executive_summary}
              </p>
              <p className="whitespace-pre-wrap text-justify">
                {reportRow.report.final_recommendation.rationale}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecruitmentPageContent() {
  const searchParams = useSearchParams();
  const interviewParam = searchParams?.get("interview");
  const tabParam = searchParams?.get("tab");
  const [activeTab, setActiveTab] = useState<
    | "applications"
    | "offer"
    | "onboarding"
    | "employees"
    | "careers"
    | "screening"
    | "interview"
    | "approvals"
  >(
    tabParam === "offer"
      ? "offer"
      : tabParam === "onboarding"
        ? "onboarding"
        : tabParam === "employees"
          ? "employees"
          : tabParam === "careers"
            ? "careers"
            : tabParam === "screening" ||
                tabParam === "ai_rejects" ||
                tabParam === "rejects"
              ? "screening"
              : tabParam === "interview"
                ? "interview"
                : tabParam === "approvals"
                  ? "approvals"
                  : "applications",
  );

  const [nameFilters, setNameFilters] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [selected, setSelected] = useState<JobApplication | null>(null);
  const [autoOpenInterviewId, setAutoOpenInterviewId] = useState<string | null>(
    null,
  );
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

  // Tabs are now partitioned purely by the application's current status,
  // regardless of how it got there (AI screening vs. HR's own call).
  const applicationsTabApplications = useMemo(
    () => (data ?? []).filter((a) => a.status === "applied"),
    [data],
  );

  // Screening stage: shortlisted, under review, rejected — rows sorted into
  // exactly that order.
  const SCREENING_STATUS_ORDER: ApplicationStatus[] = [
    "shortlisted",
    "under_review",
    "rejected",
  ];
  const screeningApplications = useMemo(() => {
    const rank = new Map(
      SCREENING_STATUS_ORDER.map((s, i) => [s, i] as const),
    );
    return (data ?? [])
      .filter((a) => rank.has(a.status))
      .slice()
      .sort((a, b) => rank.get(a.status)! - rank.get(b.status)!);
  }, [data]);

  const interviewApplications = useMemo(
    () => (data ?? []).filter((a) => a.status === "interview"),
    [data],
  );

  const evaluationApplications = useMemo(
    () => (data ?? []).filter((a) => a.status === "evaluation"),
    [data],
  );

  const holdApplications = useMemo(
    () => (data ?? []).filter((a) => a.status === "hold"),
    [data],
  );

  // Every applicant with a confirmed Hire decision — status "offer" — moves
  // to the Offer tab. From there HR sends the congratulations email with
  // the onboarding link, which is what advances them to "onboarding".
  const offerApplications = useMemo(
    () => (data ?? []).filter((a) => a.status === "offer"),
    [data],
  );

  const { data: activeOnboardingRows = [] } = useQuery({
    queryKey: ["onboarding_submissions"],
    queryFn: async () => {
      const res = await api.get("/careers/onboarding");
      return res.data.data as unknown[];
    },
    enabled: isHr,
  });

  const activeOnboardingCount = activeOnboardingRows.length;
  // Applications tab now shows only status "applied".
  const mainApplications = applicationsTabApplications;

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
      if (
        opts.role &&
        opts.role.length > 0 &&
        !opts.role.includes(a.role_title)
      )
        return false;
      if (
        opts.status &&
        opts.status.length > 0 &&
        !opts.status.includes(a.status)
      )
        return false;
      return true;
    });

  const nameOptions = useMemo(() => {
    const scoped = applyFilters(mainApplications, {
      role: roleFilters,
      status: statusFilters,
    });
    return Array.from(new Set(scoped.map((a) => a.full_name)))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n }));
  }, [mainApplications, roleFilters, statusFilters]);

  const roleOptions = useMemo(() => {
    const scoped = applyFilters(mainApplications, {
      name: nameFilters,
      status: statusFilters,
    });
    return Array.from(new Set(scoped.map((a) => a.role_title)))
      .sort((a, b) => a.localeCompare(b))
      .map((r) => ({ value: r, label: r }));
  }, [mainApplications, nameFilters, statusFilters]);

  const statusOptions = useMemo(() => {
    const scoped = applyFilters(mainApplications, {
      name: nameFilters,
      role: roleFilters,
    });
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

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [nameFilters, roleFilters, statusFilters]);
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const hasActiveFilters =
    nameFilters.length + roleFilters.length + statusFilters.length > 0;

  const clearAllFilters = () => {
    setNameFilters([]);
    setRoleFilters([]);
    setStatusFilters([]);
  };

  const awaitingScreeningCount = (data ?? []).filter(
    isAwaitingAiScreening,
  ).length;

  useEffect(() => {
    if (tabParam === "offer") setActiveTab("offer");
    else if (tabParam === "onboarding") setActiveTab("onboarding");
    else if (tabParam === "employees") setActiveTab("employees");
    else if (tabParam === "careers") setActiveTab("careers");
    else if (
      tabParam === "screening" ||
      tabParam === "ai_rejects" ||
      tabParam === "rejects"
    )
      setActiveTab("screening");
    else if (tabParam === "interview") setActiveTab("interview");
    else if (tabParam === "approvals") setActiveTab("approvals");
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
        {(
          [
            "careers",
            "applications",
            "screening",
            "interview",
            "approvals",
            "offer",
            "onboarding",
            "employees",
          ] as const
        ).map((tab) => (
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
            {tab === "careers"
              ? "Job posting"
              : tab === "applications"
                ? "Applications"
                : tab === "screening"
                  ? "Screening stage"
                  : tab === "interview"
                    ? "Interview"
                    : tab === "approvals"
                      ? "Evaluation"
                      : tab === "offer"
                        ? "Offer"
                        : tab === "employees"
                          ? "Employees"
                          : "Onboarding"}
            {tab === "screening" && screeningApplications.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {screeningApplications.length}
              </span>
            )}
            {tab === "interview" && interviewApplications.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {interviewApplications.length}
              </span>
            )}
            {tab === "approvals" &&
              evaluationApplications.length + holdApplications.length >
                0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {evaluationApplications.length + holdApplications.length}
                </span>
              )}
            {tab === "offer" && offerApplications.length > 0 && (
              <span className="bg-green-100 text-green-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {offerApplications.length}
              </span>
            )}
            {tab === "onboarding" && activeOnboardingCount > 0 && (
              <span className="bg-green-100 text-green-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {activeOnboardingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "careers" ? (
        <CareersTab adminId={session?.user?.id ?? ""} />
      ) : activeTab === "screening" ? (
        <ScreeningStageTab
          applications={screeningApplications}
          isLoading={isLoading}
          onSelect={setSelected}
        />
      ) : activeTab === "interview" ? (
        <InterviewTab
          applications={interviewApplications}
          isLoading={isLoading}
          onSelect={setSelected}
        />
      ) : activeTab === "approvals" ? (
        <ApprovalsTab
          applications={evaluationApplications}
          holdApplications={holdApplications}
          isLoading={isLoading}
          onSelect={setSelected}
          adminId={session?.user?.id ?? ""}
        />
      ) : activeTab === "offer" ? (
        <OfferTab
          applications={offerApplications}
          isLoading={isLoading}
          onSelect={setSelected}
        />
      ) : activeTab === "onboarding" ? (
        <OnboardingTab />
      ) : activeTab === "employees" ? (
        <EmployeesTab />
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
                    onRemove={() =>
                      setNameFilters(nameFilters.filter((v) => v !== n))
                    }
                  />
                ))}
                {roleFilters.map((r) => (
                  <FilterChip
                    key={`role-${r}`}
                    label={r}
                    onRemove={() =>
                      setRoleFilters(roleFilters.filter((v) => v !== r))
                    }
                  />
                ))}
                {statusFilters.map((s) => (
                  <FilterChip
                    key={`status-${s}`}
                    label={STATUS_LABELS[s as ApplicationStatus]}
                    onRemove={() =>
                      setStatusFilters(statusFilters.filter((v) => v !== s))
                    }
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
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Candidate
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Role
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Ref</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Applied
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
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-gray-400"
                    >
                      No applications found.
                    </td>
                  </tr>
                ) : (
                  paginated.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-gray-100 hover:bg-gray-50/80"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {a.full_name}
                        </p>
                        <p className="text-xs text-gray-400">{a.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {a.role_title}
                      </td>
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
            <Pagination
              page={page}
              pageCount={pageCount}
              onPageChange={setPage}
              totalItems={filtered.length}
            />
          </div>
        </>
      )}

      {selected &&
        (activeTab === "applications" ||
          activeTab === "screening" ||
          activeTab === "interview" ||
          activeTab === "approvals" ||
          activeTab === "offer") && (
          <ApplicationDetail
            application={selected}
            onClose={() => setSelected(null)}
            adminId={session.user!.id}
            openInterviewOnMount={autoOpenInterviewId === selected.id}
            onInterviewOpened={() => setAutoOpenInterviewId(null)}
            onRefreshApplication={async () => {
              await queryClient.invalidateQueries({
                queryKey: ["job_applications"],
              });
              const res = await api.get("/careers/applications");
              const apps = res.data.data as JobApplication[];
              queryClient.setQueryData(["job_applications"], apps);
              const fresh = apps.find((a) => a.id === selected.id);
              if (fresh) setSelected(fresh);
            }}
            onUpdated={() => {
              queryClient.invalidateQueries({ queryKey: ["job_applications"] });
              queryClient.invalidateQueries({
                queryKey: ["onboarding_submissions"],
              });
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
