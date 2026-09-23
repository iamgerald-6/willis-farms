"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileText, Loader2, Mail, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { OnboardingFormData, OnboardingHrData } from "@/lib/careers/onboardingTypes";
import type {
  MedicalExamination,
  MedicalExaminationHistoryEntry,
  MedicalFormResponses,
  MedicalFormSchema,
  MedicalReferralData,
} from "@/lib/medical/medicalFormSchema";
import MedicalExamPreviewModal from "./MedicalExamPreviewModal";
import MedicalExamConfigureModal from "./MedicalExamConfigureModal";
import { MEDICAL_JOB_CATEGORY_OPTIONS } from "@/lib/medical/medicalFormDefaults";
import { isMedicalFormConfiguredForCategory } from "@/lib/medical/medicalExamRequirementsMatrix";
import {
  isExecutiveRoleLabel,
  isHumanResourceRoleLabel,
} from "@/lib/userRoleAccessControl";

type User = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  job_position: string | null;
  user_role_label: string | null;
  is_disabled: boolean;
};

type Props = {
  applicationId: string;
  formData: OnboardingFormData;
  hrData: OnboardingHrData;
  setHrData: React.Dispatch<React.SetStateAction<OnboardingHrData>>;
};

const EXAM_TYPES = ["Pre-employment", "Periodic", "Return-to-work"];

type PreviewData = {
  schema: MedicalFormSchema;
  responses: MedicalFormResponses;
  referral: MedicalReferralData;
  status: string;
  submittedAt?: string | null;
};

function hrStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isNoticeRecipient(user: User): boolean {
  if (user.is_disabled || !user.email?.trim()) return false;
  return (
    isExecutiveRoleLabel(user.user_role_label) ||
    isHumanResourceRoleLabel(user.user_role_label)
  );
}

function formatStaffOption(user: User): string {
  const name = `${user.first_name} ${user.last_name}`.trim();
  const title = user.job_position?.trim();
  return title ? `${name} (${title})` : name;
}

function medicalExamPdfUrl(applicationId: string, historyId?: string): string {
  const params = new URLSearchParams({ application_id: applicationId });
  if (historyId) params.set("history_id", historyId);
  return `/api/reports/medical-examination/pdf?${params.toString()}`;
}

export default function OnboardingMedicalExamPanel({
  applicationId,
  formData,
  hrData,
  setHrData,
}: Props) {
  const queryClient = useQueryClient();
  const [hospitalEmail, setHospitalEmail] = useState(hrStr(hrData.medical_hospital_email));
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [noticeRecipientIds, setNoticeRecipientIds] = useState<string[]>([]);
  const [intelSummary, setIntelSummary] = useState(hrStr(hrData.medical_exam_intel_summary));

  useEffect(() => {
    setIntelSummary(hrStr(hrData.medical_exam_intel_summary));
  }, [hrData.medical_exam_intel_summary]);

  const { data: examData, isLoading } = useQuery({
    queryKey: ["medical-examination", applicationId],
    queryFn: async () => {
      const res = await api.get(`/careers/medical-examination/${applicationId}`);
      return res.data.data as { examination: MedicalExamination | null };
    },
  });

  const { data: historyData } = useQuery({
    queryKey: ["medical-examination-history", applicationId],
    queryFn: async () => {
      const res = await api.get(`/careers/medical-examination/${applicationId}/history`);
      return res.data.data as { history: MedicalExaminationHistoryEntry[] };
    },
  });

  const examination = examData?.examination ?? null;
  const history = historyData?.history ?? [];
  const isSubmitted = examination?.status === "submitted";
  const jobCategory = hrStr(hrData.medical_job_category);
  const formConfigured = isMedicalFormConfiguredForCategory(
    examination?.referral_data?.form_config,
    jobCategory,
  );

  const {
    data: allUsers = [],
    isLoading: usersLoading,
    isFetching: usersFetching,
  } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: isSubmitted,
  });

  const noticeRecipients = useMemo(
    () => allUsers.filter(isNoticeRecipient),
    [allUsers],
  );

  const usersListLoading = isSubmitted && (usersLoading || usersFetching) && allUsers.length === 0;

  const toggleNoticeRecipient = (userId: string) => {
    setNoticeRecipientIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/careers/medical-examination/generate-summary", {
        application_id: applicationId,
      });
      return res.data.data as { summary: string; generated_by: string };
    },
    onSuccess: (data) => {
      setIntelSummary(data.summary);
      setHrData((prev) => ({
        ...prev,
        medical_exam_intel_summary: data.summary,
        medical_exam_intel_summary_generated_at: new Date().toISOString(),
      }));
      toast.success(
        data.generated_by === "intel"
          ? "Medical report summary ready — review before sending."
          : "Medical report summary ready (Intel unavailable — review before sending).",
      );
    },
    onError: (error: unknown) => {
      const msg =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not generate summary.";
      toast.error(msg);
    },
  });

  const sendReportEmailMutation = useMutation({
    mutationFn: async () => {
      if (noticeRecipientIds.length === 0) {
        throw new Error("Select at least one executive or HR colleague to copy.");
      }
      if (!intelSummary.trim()) {
        throw new Error("Generate the medical report summary first.");
      }
      await api.post("/careers/medical-examination/notify", {
        application_id: applicationId,
        notice_recipient_user_ids: noticeRecipientIds,
        summary_report: intelSummary.trim(),
      });
    },
    onSuccess: () => {
      const now = new Date().toISOString();
      setHrData((prev) => ({ ...prev, medical_exam_notice_sent_at: now }));
      toast.success("Medical report summary and PDF emailed to you with colleagues copied.");
    },
    onError: (error: unknown) => {
      const msg =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (error instanceof Error ? error.message : "Failed to send email.");
      toast.error(msg);
    },
  });

  const previewExamination = () => {
    if (!examination) return;
    setPreviewData({
      schema: examination.form_schema,
      responses: examination.form_responses,
      referral: examination.referral_data,
      status: examination.status,
      submittedAt: examination.submitted_at,
    });
  };

  const previewHistoryEntry = (entry: MedicalExaminationHistoryEntry) => {
    setPreviewData({
      schema: entry.form_schema,
      responses: entry.form_responses,
      referral: entry.referral_data,
      status: entry.status,
      submittedAt: entry.submitted_at,
    });
  };

  const updateHrField = (key: keyof OnboardingHrData, value: string) => {
    setHrData((prev) => ({ ...prev, [key]: value }));
  };

  const referralHrPayload = (): OnboardingHrData => ({
    medical_examination_type: hrData.medical_examination_type,
    medical_job_category: hrData.medical_job_category,
    medical_designated_facility: hrData.medical_designated_facility,
    medical_appointment_date: hrData.medical_appointment_date,
    medical_hospital_email: hospitalEmail,
  });

  const handleGenerateEmail = async () => {
    if (!hospitalEmail.trim()) {
      toast.error("Enter the hospital email address first.");
      return;
    }
    if (!jobCategory.trim()) {
      toast.error("Select a job category before sending.");
      return;
    }
    if (!formConfigured) {
      toast.error("Click Configure form for this job category first.");
      return;
    }

    setGenerating(true);
    try {
      const res = await api.post("/careers/medical-examination/generate-email", {
        application_id: applicationId,
        hospital_email: hospitalEmail.trim(),
        hr_data: referralHrPayload(),
      });
      const data = res.data.data as {
        subject: string;
        body: string;
        form_url?: string;
        generated_by?: string;
      };
      setEmailSubject(data.subject);
      setEmailBody(data.body);
      setFormUrl(data.form_url ?? "");
      updateHrField("medical_hospital_email", hospitalEmail.trim());
      toast.success(
        data.generated_by === "intel"
          ? "Email draft ready — review and send."
          : "Email draft ready.",
      );
      void queryClient.invalidateQueries({ queryKey: ["medical-examination", applicationId] });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not generate email.";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast.error("Generate the email draft first.");
      return;
    }
    setSending(true);
    try {
      await api.post("/careers/medical-examination/send", {
        application_id: applicationId,
        examination_id: examination?.id,
        hospital_email: hospitalEmail.trim(),
        subject: emailSubject.trim(),
        body: emailBody.trim(),
        form_url: formUrl.trim() || undefined,
        hr_data: referralHrPayload(),
      });
      toast.success("Medical form link sent to the hospital.");
      void queryClient.invalidateQueries({ queryKey: ["medical-examination", applicationId] });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not send email.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleResetForResend = async () => {
    try {
      await api.post("/careers/medical-examination/resend", { application_id: applicationId });
      setEmailSubject("");
      setEmailBody("");
      setFormUrl("");
      setIntelSummary("");
      setNoticeRecipientIds([]);
      toast.success("Examination reset — you can send a new link with the latest form.");
      void queryClient.invalidateQueries({ queryKey: ["medical-examination", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["medical-examination-history", applicationId] });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not reset examination.";
      toast.error(msg);
    }
  };

  const statusLabel = !examination
    ? "Not started"
    : examination.status === "submitted"
      ? "Submitted by hospital"
      : examination.link_sent_at
        ? "Link sent — awaiting completion"
        : "Draft prepared";

  const shareBusy = generateSummaryMutation.isPending || sendReportEmailMutation.isPending;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Occupational medical examination</h3>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            Complete Part 1 referral details, then send the hospital a secure link to fill Parts 2–6.
            Candidate self-declaration is shown below for reference.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg border border-white bg-white/80 px-3 py-2">
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Declared blood group</p>
            <p className="font-medium text-gray-800 mt-0.5">{formData.medical?.blood_group?.trim() || "—"}</p>
          </div>
          <div className="rounded-lg border border-white bg-white/80 px-3 py-2 sm:col-span-2">
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Declared allergies</p>
            <p className="font-medium text-gray-800 mt-0.5">{formData.medical?.allergies?.trim() || "—"}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg border border-white bg-white/80 px-3 py-2">
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Status</p>
            <p className="font-semibold text-gray-800 mt-0.5">{isLoading ? "…" : statusLabel}</p>
          </div>
          <div className="rounded-lg border border-white bg-white/80 px-3 py-2">
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Link sent</p>
            <p className="font-medium text-gray-800 mt-0.5">{formatDate(examination?.link_sent_at)}</p>
          </div>
          <div className="rounded-lg border border-white bg-white/80 px-3 py-2">
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Submitted</p>
            <p className="font-medium text-gray-800 mt-0.5">{formatDate(examination?.submitted_at)}</p>
          </div>
        </div>

        <div className="rounded-lg border border-white bg-white p-4 space-y-3">
          <p className="text-xs font-bold text-gray-800">Part 1 — Referral (HR)</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="text-gray-500">Examination type</span>
              <select
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={hrStr(hrData.medical_examination_type) || "Pre-employment"}
                onChange={(e) => updateHrField("medical_examination_type", e.target.value)}
                disabled={isSubmitted}
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-gray-500">
                Job category<span className="text-red-600 ml-0.5">*</span>
              </span>
              <select
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={hrStr(hrData.medical_job_category)}
                onChange={(e) => updateHrField("medical_job_category", e.target.value)}
                disabled={isSubmitted}
              >
                <option value="">Select…</option>
                {MEDICAL_JOB_CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs sm:col-span-2">
              <span className="text-gray-500">Designated facility</span>
              <input
                type="text"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={hrStr(hrData.medical_designated_facility)}
                onChange={(e) => updateHrField("medical_designated_facility", e.target.value)}
                placeholder="Clinic or hospital name"
                disabled={isSubmitted}
              />
            </label>
            <label className="block text-xs">
              <span className="text-gray-500">Appointment date</span>
              <input
                type="date"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={hrStr(hrData.medical_appointment_date)}
                onChange={(e) => updateHrField("medical_appointment_date", e.target.value)}
                disabled={isSubmitted}
              />
            </label>
            <label className="block text-xs">
              <span className="text-gray-500">
                Hospital email<span className="text-red-600 ml-0.5">*</span>
              </span>
              <input
                type="email"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={hospitalEmail}
                onChange={(e) => setHospitalEmail(e.target.value)}
                placeholder="clinic@example.com"
                disabled={isSubmitted}
              />
            </label>
          </div>
        </div>

        {!isSubmitted && jobCategory && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              formConfigured
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {formConfigured
              ? "Hospital form configured for this job category — you can preview or send."
              : "Configure which examination components the hospital should complete for this job category."}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfigureOpen(true)}
            disabled={isSubmitted || !jobCategory}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            Configure form
          </button>
          <button
            type="button"
            onClick={() => void handleGenerateEmail()}
            disabled={generating || isSubmitted || !formConfigured}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Draft email with WillsOne Intel
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !emailBody || isSubmitted}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            Send to hospital
          </button>
          {examination && (
            <button
              type="button"
              onClick={previewExamination}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <Eye className="w-3.5 h-3.5" />
              {isSubmitted ? "View submitted form" : "Preview form"}
            </button>
          )}
          {isSubmitted && (
            <>
              <a
                href={medicalExamPdfUrl(applicationId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </a>
              <button
                type="button"
                onClick={() => void handleResetForResend()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:text-gray-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Resend new link
              </button>
            </>
          )}
        </div>

        {isSubmitted && (
          <div className="rounded-lg border border-white bg-white p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-gray-800">Share submitted report</p>
              <p className="mt-1 text-[11px] text-gray-500 leading-relaxed">
                Generate a medical report summary with WillsOne Intel, then email it with the
                full PDF to yourself and copy selected executive / HR colleagues.
              </p>
              {hrData.medical_exam_notice_sent_at && (
                <p className="mt-2 text-[11px] text-emerald-700">
                  Last sent {formatDate(hrData.medical_exam_notice_sent_at)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-700">Medical report summary</p>
                <button
                  type="button"
                  onClick={() => generateSummaryMutation.mutate()}
                  disabled={shareBusy}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                >
                  {generateSummaryMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {intelSummary.trim()
                    ? "Regenerate medical report summary"
                    : "Generate medical report summary"}
                </button>
              </div>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs min-h-[180px] leading-relaxed"
                value={intelSummary}
                onChange={(e) => setIntelSummary(e.target.value)}
                placeholder="Generate a medical report summary of the submitted examination — you can edit it before sending."
              />
              {hrData.medical_exam_intel_summary_generated_at && (
                <p className="text-[10px] text-gray-400">
                  Generated {formatDate(hrData.medical_exam_intel_summary_generated_at)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700">Copy executive / HR colleagues</p>
              {usersListLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Loading colleagues…
                </div>
              ) : noticeRecipients.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  No executive or HR staff with email on file. Add colleagues under Access Control
                  first.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {noticeRecipients.map((u) => (
                    <label
                      key={u.user_id}
                      className="flex items-start gap-3 px-3 py-2.5 text-xs text-gray-800 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={noticeRecipientIds.includes(u.user_id)}
                        onChange={() => toggleNoticeRecipient(u.user_id)}
                        className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-200"
                      />
                      <span>{formatStaffOption(u)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => sendReportEmailMutation.mutate()}
              disabled={
                shareBusy ||
                !intelSummary.trim() ||
                noticeRecipientIds.length === 0 ||
                noticeRecipients.length === 0
              }
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {sendReportEmailMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5" />
              )}
              Email medical report summary &amp; PDF to me &amp; copy colleagues
            </button>
          </div>
        )}

        {(emailSubject || emailBody) && !isSubmitted && (
          <div className="rounded-lg border border-white bg-white p-4 space-y-3">
            <p className="text-xs font-bold text-gray-800">Email preview</p>
            <label className="block text-xs">
              <span className="text-gray-500">Subject</span>
              <input
                type="text"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              <span className="text-gray-500">Message</span>
              <textarea
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[160px]"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
              />
            </label>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div>
            <p className="text-xs font-bold text-gray-800">Submission history</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              Earlier examination cycles for this candidate — kept even after a new link is sent, so
              nothing a hospital already submitted is lost.
            </p>
          </div>
          <ul className="space-y-1.5">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2"
              >
                <div className="text-xs">
                  <p className="font-medium text-gray-800">
                    {entry.status === "submitted"
                      ? `Submitted ${formatDate(entry.submitted_at)}`
                      : `Link sent ${formatDate(entry.link_sent_at)} — not completed`}
                  </p>
                  {entry.referral_data?.examination_type && (
                    <p className="text-gray-400 mt-0.5">{entry.referral_data.examination_type}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entry.status === "submitted" && (
                    <a
                      href={medicalExamPdfUrl(applicationId, entry.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      PDF
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => previewHistoryEntry(entry)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {previewData && (
        <MedicalExamPreviewModal
          open
          onClose={() => setPreviewData(null)}
          schema={previewData.schema}
          responses={previewData.responses}
          referral={previewData.referral}
          status={previewData.status}
          submittedAt={previewData.submittedAt}
        />
      )}

      {configureOpen && !isSubmitted && (
        <MedicalExamConfigureModal
          open
          onClose={() => setConfigureOpen(false)}
          applicationId={applicationId}
          jobCategory={jobCategory}
          hrData={hrData}
          existingConfig={examination?.referral_data?.form_config}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["medical-examination", applicationId] });
          }}
        />
      )}
    </div>
  );
}
