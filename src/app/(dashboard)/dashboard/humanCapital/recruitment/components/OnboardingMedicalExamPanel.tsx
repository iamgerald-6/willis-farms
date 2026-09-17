"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Mail, RefreshCw, Sparkles } from "lucide-react";
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
import { MEDICAL_JOB_CATEGORY_OPTIONS } from "@/lib/medical/medicalFormDefaults";

type Props = {
  applicationId: string;
  formData: OnboardingFormData;
  hrData: OnboardingHrData;
  setHrData: React.Dispatch<React.SetStateAction<OnboardingHrData>>;
  onPersist?: (hrData: OnboardingHrData) => void;
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

export default function OnboardingMedicalExamPanel({
  applicationId,
  formData,
  hrData,
  setHrData,
  onPersist,
}: Props) {
  const queryClient = useQueryClient();
  const [hospitalEmail, setHospitalEmail] = useState(hrStr(hrData.medical_hospital_email));
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

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
    setHrData((prev) => {
      const next = { ...prev, [key]: value };
      onPersist?.(next);
      return next;
    });
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
    if (!hrStr(hrData.medical_job_category).trim()) {
      toast.error("Select a job category before sending.");
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
              />
            </label>
            <label className="block text-xs">
              <span className="text-gray-500">Appointment date</span>
              <input
                type="date"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={hrStr(hrData.medical_appointment_date)}
                onChange={(e) => updateHrField("medical_appointment_date", e.target.value)}
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
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleGenerateEmail()}
            disabled={generating || examination?.status === "submitted"}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Draft email with WillsFarms Intel
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !emailBody || examination?.status === "submitted"}
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
              {examination.status === "submitted" ? "View submitted form" : "Preview form"}
            </button>
          )}
          {examination?.status === "submitted" && (
            <button
              type="button"
              onClick={() => void handleResetForResend()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:text-gray-800"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Resend new link
            </button>
          )}
        </div>

        {(emailSubject || emailBody) && examination?.status !== "submitted" && (
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
                <button
                  type="button"
                  onClick={() => previewHistoryEntry(entry)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900 shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View
                </button>
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
    </div>
  );
}
