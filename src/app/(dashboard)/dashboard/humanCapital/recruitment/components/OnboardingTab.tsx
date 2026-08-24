"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  applyApplicationPrefill,
  mergeInitialOnboardingHrData,
  mergeOnboardingForm,
  type OnboardingFormData,
  type OnboardingHrData,
} from "@/lib/careers/onboardingTypes";
import OnboardingHrFieldsForm from "./OnboardingHrFieldsForm";
import CandidateProfileReview from "@/components/onboarding/CandidateProfileReview";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/careers/types";
import { Loader2, Mail, RefreshCw, X, ExternalLink } from "lucide-react";
import type { OnboardingHrReferenceContext } from "@/lib/careers/sendRefereeReferenceInvites";
import { toast } from "sonner";

type SubmissionRow = {
  id: string;
  application_id: string;
  form_data: OnboardingFormData;
  hr_data: OnboardingHrData;
  submitted_at: string | null;
  updated_at: string;
  job_applications: {
    id: string;
    reference_number: string;
    full_name: string;
    email: string;
    phone: string;
    role_title: string;
    status: string;
    location?: string | null;
    application_form_data?: Record<string, unknown> | null;
  };
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function OnboardingDetail({
  row,
  onClose,
  onUpdated,
}: {
  row: SubmissionRow;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const app = row.job_applications;
  const form = applyApplicationPrefill(mergeOnboardingForm(row.form_data), {
    full_name: app.full_name,
    email: app.email,
    phone: app.phone,
    role_title: app.role_title,
  });
  const [hrData, setHrData] = useState<OnboardingHrData>(() =>
    mergeInitialOnboardingHrData({
      hr_data: row.hr_data,
      form_data: row.form_data,
      role_title: app.role_title,
      location: app.location,
    }),
  );
  const employeeIdTouched = useRef(Boolean(row.hr_data?.employee_id?.trim()));
  const companyEmailTouched = useRef(Boolean(row.hr_data?.company_email?.trim()));

  const { data: hrReference, isLoading: loadingHrReference } = useQuery({
    queryKey: ["onboarding-hr-reference", row.application_id],
    queryFn: async () => {
      const res = await api.get(
        `/careers/onboarding/hr-reference?application_id=${row.application_id}`,
      );
      return res.data.data as OnboardingHrReferenceContext;
    },
  });

  const { data: suggestions, isLoading: loadingSuggestions, refetch: refetchSuggestions } =
    useQuery({
      queryKey: ["onboarding-hr-suggest", row.application_id, hrData.grade_level ?? ""],
      queryFn: async () => {
        const params = new URLSearchParams({ application_id: row.application_id });
        if (hrData.grade_level?.trim()) {
          params.set("grade_level", hrData.grade_level.trim());
        }
        const res = await api.get(`/careers/onboarding/suggest-hr-fields?${params}`);
        return res.data.data as {
          grade_level: string | null;
          employee_id: string | null;
          company_email: string | null;
        };
      },
    });

  useEffect(() => {
    if (!suggestions) return;
    setHrData((prev) => {
      const next = { ...prev };
      if (!prev.grade_level?.trim() && suggestions.grade_level) {
        next.grade_level = suggestions.grade_level;
      }
      if (!employeeIdTouched.current && suggestions.employee_id) {
        next.employee_id = suggestions.employee_id;
      }
      if (!companyEmailTouched.current && suggestions.company_email) {
        next.company_email = suggestions.company_email;
      }
      return next;
    });
  }, [suggestions]);

  const applySuggestions = () => {
    employeeIdTouched.current = false;
    companyEmailTouched.current = false;
    void refetchSuggestions().then((result) => {
      const data = result.data;
      if (!data) return;
      setHrData((prev) => ({
        ...prev,
        employee_id: data.employee_id ?? prev.employee_id,
        company_email: data.company_email ?? prev.company_email,
        grade_level: prev.grade_level || data.grade_level || prev.grade_level,
      }));
      toast.success("Suggestions refreshed.");
    });
  };

  const saveHr = useMutation({
    mutationFn: () =>
      api.patch("/careers/onboarding", {
        application_id: row.application_id,
        hr_data: hrData,
      }),
    onSuccess: () => {
      toast.success("HR fields saved.");
      onUpdated();
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e?.response?.data?.error ?? "Save failed.");
    },
  });

  const resend = useMutation({
    mutationFn: () =>
      api.post("/careers/onboarding/resend", {
        application_id: row.application_id,
      }),
    onSuccess: (res) => {
      if (res.data.email_warning) {
        toast.warning(`Link created but email issue: ${res.data.email_warning}`);
      } else {
        toast.success("Onboarding link resent to candidate.");
      }
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e?.response?.data?.error ?? "Resend failed.");
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">{app.full_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {app.role_title} · Ref {app.reference_number}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
              Status: {app.status}
            </span>
            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
              Submitted: {formatDate(row.submitted_at)}
            </span>
          </div>

          <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">Applicant information</h3>
              <p className="text-xs text-gray-500 mb-3">
                Use the dates below when recording medical referral and reference form issue dates
                in HR notes.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-400 text-xs block">Full name</span>
                  <span className="font-medium text-gray-900">{app.full_name}</span>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block">Position</span>
                  <span className="font-medium text-gray-900">{app.role_title}</span>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block">Email</span>
                  <span className="font-medium text-gray-900">{app.email}</span>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block">Phone</span>
                  <span className="font-medium text-gray-900">{app.phone}</span>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block">Application submitted</span>
                  <span className="font-medium text-gray-900">
                    {loadingHrReference
                      ? "Loading…"
                      : formatDateTime(hrReference?.application_submitted_at ?? null)}
                  </span>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Referee reference emails are sent when the candidate submits their application.
                  </p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs block">Onboarding submitted</span>
                  <span className="font-medium text-gray-900">{formatDate(row.submitted_at)}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Referees (from job application)
              </h4>
              {loadingHrReference ? (
                <p className="text-sm text-gray-400">Loading referee activity…</p>
              ) : (hrReference?.referees.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-500">No referees listed on the application.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {hrReference!.referees.map((ref) => (
                    <li
                      key={ref.referee_index}
                      className="bg-white border border-gray-200 rounded-lg px-3 py-2"
                    >
                      <p className="font-medium text-gray-900">
                        Referee {ref.referee_index}: {ref.referee_name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {ref.relationship}
                        {ref.referee_email ? ` · ${ref.referee_email}` : ""}
                        {ref.phone ? ` · ${ref.phone}` : ""}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Reference invite sent:{" "}
                        <strong>{formatDateTime(ref.invite_sent_at)}</strong>
                      </p>
                      <p className="text-xs text-gray-600">
                        Reference received:{" "}
                        <strong>
                          {ref.submitted_at
                            ? formatDateTime(ref.submitted_at)
                            : "Awaiting referee"}
                        </strong>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Medical (from candidate onboarding)
              </h4>
              {loadingHrReference ? (
                <p className="text-sm text-gray-400">Loading medical info…</p>
              ) : (
                <ul className="text-sm space-y-1 text-gray-700">
                  <li>
                    Referral acknowledged by candidate:{" "}
                    <strong>
                      {hrReference?.medical.acknowledged_referral ? "Yes" : "No"}
                    </strong>
                  </li>
                  <li>
                    Medical step completed:{" "}
                    <strong>
                      {formatDateTime(hrReference?.medical.medical_step_completed_at ?? null)}
                    </strong>
                  </li>
                  <li className="flex flex-wrap items-center gap-1">
                    Medical report uploaded:{" "}
                    <strong>
                      {hrReference?.medical.medical_report_uploaded ? "Yes" : "No"}
                    </strong>
                    {hrReference?.medical.medical_report_url && (
                      <a
                        href={hrReference.medical.medical_report_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs text-red-600 hover:underline"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </li>
                </ul>
              )}
            </div>
          </section>

          {app.status === "onboarding" && !row.submitted_at && (
            <button
              type="button"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
              className="inline-flex items-center gap-2 text-sm font-medium text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg hover:bg-red-100"
            >
              {resend.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Resend onboarding link
            </button>
          )}

          <section>
            <CandidateProfileReview
              applicationFormData={app.application_form_data ?? null}
              onboardingFormData={form}
              showPrintButton={false}
              header={{
                fullName: app.full_name,
                roleTitle: app.role_title,
                referenceNumber: app.reference_number,
                submittedAt: row.submitted_at,
                email: app.email,
                phone: app.phone,
              }}
            />
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-gray-900">HR use only (Section O)</h3>
              <button
                type="button"
                onClick={applySuggestions}
                disabled={loadingSuggestions}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
              >
                {loadingSuggestions ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Regenerate ID & email
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Employee ID is a company-wide number (WF-00001, WF-00042 — no grade in the ID).
              Company email uses first initial, dot, middle name if present, then full first name
              @willsfarms.com — e.g. k.kwame@ or j.michaeljohn@. Edit either field if needed.
              Employment placement is HR-only — candidates do not fill these on the form.
            </p>
            <OnboardingHrFieldsForm
              hrData={hrData}
              setHrData={setHrData}
              onGradeChange={() => {
                employeeIdTouched.current = false;
              }}
              onEmployeeIdChange={() => {
                employeeIdTouched.current = true;
              }}
              onCompanyEmailChange={() => {
                companyEmailTouched.current = true;
              }}
            />
            <p className="text-xs text-gray-500 mt-3">
              For issue dates, refer to the applicant information at the top — application
              submitted date, referee invite sent, and medical step completed.
            </p>
            <button
              type="button"
              onClick={() => saveHr.mutate()}
              disabled={saveHr.isPending}
              className="mt-4 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60"
            >
              {saveHr.isPending ? "Saving…" : "Save HR fields"}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingTab() {
  const [selected, setSelected] = useState<SubmissionRow | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding_submissions"],
    queryFn: async () => {
      const res = await api.get("/careers/onboarding");
      return res.data.data as SubmissionRow[];
    },
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <>
      <div className="overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
        <table className="w-full text-left text-sm min-w-[720px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">Candidate</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Submitted</th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  No onboarding records yet. Confirm a hire decision to send a magic link.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.job_applications.full_name}</p>
                    <p className="text-xs text-gray-400">{row.job_applications.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.job_applications.role_title}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {STATUS_LABELS[row.job_applications.status as ApplicationStatus] ??
                      row.job_applications.status}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(row.submitted_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
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

      {selected && (
        <OnboardingDetail
          row={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["onboarding_submissions"] });
            queryClient.invalidateQueries({ queryKey: ["job_applications"] });
            queryClient.invalidateQueries({ queryKey: ["onboarded-invite-candidates"] });
          }}
        />
      )}
    </>
  );
}
