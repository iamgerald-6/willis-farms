"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Pagination, { PAGE_SIZE } from "./Pagination";
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
import { OFFER_TERMS_LOCKED_FIELD_KEYS } from "@/lib/careers/offerTerms";
import {
  STATUS_LABELS,
  STATUS_STYLES,
  type ApplicationStatus,
} from "@/lib/careers/types";
import { FileText, Loader2, Mail, RefreshCw, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useCompanyEmailDomain } from "@/hooks/useCompanyEmailDomain";

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

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Accra",
  });
}

function offerResponseLabel(response: OnboardingHrData["offer_response"]): string {
  if (response === "accepted") return "Accepted";
  if (response === "declined") return "Declined";
  return "Awaiting response";
}

function offerResponseStyles(response: OnboardingHrData["offer_response"]): string {
  if (response === "accepted") return "bg-green-50 text-green-800 border-green-200";
  if (response === "declined") return "bg-red-50 text-red-800 border-red-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function OnboardingDetail({
  row,
  onClose,
  onUpdated,
  adminId,
}: {
  row: SubmissionRow;
  onClose: () => void;
  onUpdated: () => void;
  adminId: string;
}) {
  const app = row.job_applications;
  const form = applyApplicationPrefill(mergeOnboardingForm(row.form_data), {
    full_name: app.full_name,
    email: app.email,
    phone: app.phone,
    role_title: app.role_title,
  });
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
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
  const { domain: companyEmailDomain } = useCompanyEmailDomain();

  const { data: suggestions, isLoading: loadingSuggestions, refetch: refetchSuggestions } =
    useQuery({
      queryKey: [
        "onboarding-hr-suggest",
        row.application_id,
        hrData.grade_level ?? "",
        hrData.salary_tier ?? "",
      ],
      queryFn: async () => {
        const params = new URLSearchParams({ application_id: row.application_id });
        if (hrData.grade_level?.trim()) {
          params.set("grade_level", hrData.grade_level.trim());
        }
        if (hrData.salary_tier?.trim()) {
          params.set("salary_tier", hrData.salary_tier.trim());
        }
        const res = await api.get(`/careers/onboarding/suggest-hr-fields?${params}`);
        return res.data.data as {
          grade_level: string | null;
          employee_id: string | null;
          company_email: string | null;
          salary_tier: string | null;
          salary_range: string | null;
          salary_ghs: string | null;
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
      if (suggestions.salary_tier && !prev.salary_tier?.trim()) {
        next.salary_tier = suggestions.salary_tier;
      }
      if (suggestions.salary_range) {
        next.salary_range = suggestions.salary_range;
      }
      if (suggestions.salary_ghs && !prev.salary_ghs?.trim()) {
        next.salary_ghs = suggestions.salary_ghs;
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

  const platformInvited = Boolean(
    row.hr_data?.platform_invited_at?.trim() || row.hr_data?.hr_finished_at?.trim(),
  );

  const offerResponse = row.hr_data?.offer_response ?? "pending";
  const offerTermsLocked = Boolean(row.hr_data?.offer_terms_saved_at?.trim());
  const lockedOfferFields = offerTermsLocked ? [...OFFER_TERMS_LOCKED_FIELD_KEYS] : [];

  const finishHr = useMutation({
    mutationFn: async () => {
      await api.patch("/careers/onboarding", {
        application_id: row.application_id,
        hr_data: hrData,
      });
      const res = await api.post("/careers/onboarding/finish-hr", {
        application_id: row.application_id,
        hr_data: hrData,
      });
      return res.data;
    },
    onSuccess: (data) => {
      const login = data?.data?.email as string | undefined;
      const delivery = data?.data?.delivery_email as string | undefined;
      const detail =
        login && delivery && login !== delivery
          ? ` Invite sent to ${delivery}; they sign in with ${login}.`
          : "";
      toast.success(
        `Onboarding finished — WillsOne invite sent.${detail} Employee is on probation in the Employees tab.`,
      );
      onUpdated();
      onClose();
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e?.response?.data?.error ?? "Could not finish onboarding.");
    },
  });

  const rescindOffer = useMutation({
    mutationFn: () =>
      api.post("/careers/onboarding/rescind", {
        application_id: row.application_id,
        rescinded_by: adminId,
      }),
    onSuccess: (res) => {
      if (res.data.email_warning) {
        toast.warning(`Offer rescinded, but: ${res.data.email_warning}`);
      } else {
        toast.success("Offer rescinded — applicant moved to Rejects.");
      }
      onUpdated();
      onClose();
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e?.response?.data?.error ?? "Failed to rescind offer.");
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

  const appStatus = app.status as ApplicationStatus;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-40 p-0 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">{app.full_name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Ref {app.reference_number}
                {row.submitted_at
                  ? ` · Onboarding submitted ${formatDate(row.submitted_at)}`
                  : ""}
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
                <p className="font-medium text-gray-900 mt-1">{app.role_title}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
                <span
                  className={`inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[appStatus] ?? STATUS_STYLES.onboarding}`}
                >
                  {STATUS_LABELS[appStatus] ?? app.status}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Email</p>
                <a
                  href={`mailto:${app.email}`}
                  className="font-medium text-red-600 hover:underline mt-1 block"
                >
                  {app.email}
                </a>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Phone</p>
                <p className="font-medium text-gray-900 mt-1">{app.phone}</p>
              </div>
              {app.location && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Location</p>
                  <p className="font-medium text-gray-900 mt-1">{app.location}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Offer response</p>
                <span
                  className={`inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${offerResponseStyles(offerResponse)}`}
                >
                  {offerResponseLabel(offerResponse)}
                </span>
                {row.hr_data?.offer_response_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(row.hr_data.offer_response_at)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">
                  Onboarding submitted
                </p>
                <p className="font-medium text-gray-900 mt-1">
                  {formatDate(row.submitted_at)}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2">
              <button
                type="button"
                onClick={() => setShowPersonalInfo(true)}
                className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline"
              >
                <FileText className="w-4 h-4" />
                View employee profile
              </button>
            </div>

            {offerResponse === "declined" && app.status === "onboarding" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                <p className="text-sm text-red-800">
                  This candidate declined the offer. You can rescind and move them to Rejects.
                </p>
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
                  disabled={rescindOffer.isPending}
                  className="inline-flex items-center gap-2 text-sm font-medium text-red-700 bg-white border border-red-200 px-3 py-2 rounded-lg hover:bg-red-100 disabled:opacity-60"
                >
                  {rescindOffer.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Rescind offer & move to Rejects
                </button>
              </div>
            )}

            {app.status === "onboarding" && !row.submitted_at && (
              <button
                type="button"
                onClick={() => resend.mutate()}
                disabled={resend.isPending}
                className="inline-flex items-center gap-2 text-sm font-medium text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg hover:bg-red-100 disabled:opacity-60"
              >
                {resend.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                Resend onboarding link
              </button>
            )}

            <div>
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
                Company email uses first initial, optional middle initial, then surname @
                {companyEmailDomain} — e.g. l.akoto@ or m.oofuso@. Edit the name part if
                needed. Role, salary, and employment placement were set at offer and cannot
                be changed here.
              </p>
              {offerTermsLocked && (
                <p className="text-xs text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-3">
                  Offer terms (role, compensation, and placement) are locked from the Offer
                  stage.
                </p>
              )}
              <OnboardingHrFieldsForm
                hrData={hrData}
                setHrData={setHrData}
                readOnlyFields={lockedOfferFields}
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
              <button
                type="button"
                onClick={() => saveHr.mutate()}
                disabled={saveHr.isPending || finishHr.isPending}
                className="mt-4 w-full sm:w-auto px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60"
              >
                {saveHr.isPending ? "Saving…" : "Save HR fields"}
              </button>

              {row.submitted_at && !platformInvited && (
                <div className="mt-4 rounded-xl border border-green-100 bg-green-50/80 p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-900">
                    Finish onboarding
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    When Section O is complete, finish onboarding to send the WillsOne
                    platform invite to their job application email ({app.email}). They
                    sign in with the company email from Section O. The employee will
                    appear on the <strong>Employees</strong> tab with status{" "}
                    <strong>Probation</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => finishHr.mutate()}
                    disabled={finishHr.isPending || saveHr.isPending}
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 disabled:opacity-60"
                  >
                    {finishHr.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    {finishHr.isPending
                      ? "Finishing…"
                      : "Finish onboarding & invite to WillsOne"}
                  </button>
                </div>
              )}

              {platformInvited && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  WillsOne invite sent
                  {row.hr_data?.platform_invited_at
                    ? ` · ${formatDate(row.hr_data.platform_invited_at)}`
                    : ""}
                  . View and manage probation on the <strong>Employees</strong> tab.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showPersonalInfo && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowPersonalInfo(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">Employee profile</h2>
              <button
                type="button"
                onClick={() => setShowPersonalInfo(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto min-h-0">
              <CandidateProfileReview
                applicationFormData={app.application_form_data ?? null}
                onboardingFormData={form}
                showPrintButton
                profileDownloadUrl={`/api/careers/onboarding/profile/pdf?application_id=${row.application_id}`}
                header={{
                  fullName: app.full_name,
                  roleTitle: app.role_title,
                  referenceNumber: app.reference_number,
                  submittedAt: row.submitted_at,
                  email: app.email,
                  phone: app.phone,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function OnboardingTab({ adminId }: { adminId: string }) {
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

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  const paginated = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  return (
    <>
      <div className="overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
        <table className="w-full text-left text-sm min-w-[720px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">Candidate</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Offer</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Submitted</th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No onboarding records yet. Send the onboarding link from the Offer tab.
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.job_applications.full_name}</p>
                    <p className="text-xs text-gray-400">{row.job_applications.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.job_applications.role_title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${offerResponseStyles(row.hr_data?.offer_response)}`}
                    >
                      {offerResponseLabel(row.hr_data?.offer_response)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[(row.job_applications.status as ApplicationStatus) ?? "onboarding"]}`}
                    >
                      {STATUS_LABELS[row.job_applications.status as ApplicationStatus] ??
                        row.job_applications.status}
                    </span>
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
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          totalItems={rows.length}
        />
      </div>

      {selected && (
        <OnboardingDetail
          row={selected}
          adminId={adminId}
          onClose={() => setSelected(null)}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["onboarding_submissions"] });
            queryClient.invalidateQueries({ queryKey: ["job_applications"] });
            queryClient.invalidateQueries({ queryKey: ["onboarded-invite-candidates"] });
            queryClient.invalidateQueries({ queryKey: ["recruitment-employees"] });
          }}
        />
      )}
    </>
  );
}
