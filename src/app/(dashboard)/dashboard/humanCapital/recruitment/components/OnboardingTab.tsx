"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  applyApplicationPrefill,
  mergeOnboardingForm,
  parseApplicantName,
  type OnboardingFormData,
  type OnboardingHrData,
} from "@/lib/careers/onboardingTypes";
import { Loader2, Mail, X } from "lucide-react";
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
  const parsedName = parseApplicantName(app.full_name);
  const [hrData, setHrData] = useState<OnboardingHrData>(row.hr_data ?? {});

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

  const hrField = (key: keyof OnboardingHrData, label: string) => (
    <label key={key} className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        value={hrData[key] ?? ""}
        onChange={(e) => setHrData((prev) => ({ ...prev, [key]: e.target.value }))}
      />
    </label>
  );

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
            <h3 className="text-sm font-bold text-gray-900 mb-3">From job application</h3>
            <p className="text-xs text-gray-500 mb-2">Pre-filled for the candidate — not editable on their form.</p>
            <div className="grid sm:grid-cols-2 gap-3 text-sm bg-gray-100 rounded-xl p-4 border border-gray-200">
              <div>
                <span className="text-gray-400 text-xs block">Full name</span>
                <span className="font-medium text-gray-900">{app.full_name}</span>
              </div>
              <div>
                <span className="text-gray-400 text-xs block">First name</span>
                <span className="font-medium text-gray-900">{parsedName.first_name}</span>
              </div>
              <div>
                <span className="text-gray-400 text-xs block">Surname</span>
                <span className="font-medium text-gray-900">{parsedName.surname}</span>
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
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3">Candidate onboarding answers</h3>
            <div className="grid sm:grid-cols-2 gap-3 text-sm bg-gray-50 rounded-xl p-4">
              <div><span className="text-gray-400 text-xs block">Ghana Card</span>{form.personal?.ghana_card_no ?? "—"}</div>
              <div><span className="text-gray-400 text-xs block">SSNIT</span>{form.personal?.ssnit_number ?? "—"}</div>
              <div><span className="text-gray-400 text-xs block">Region</span>{form.personal?.region ?? "—"}</div>
              <div><span className="text-gray-400 text-xs block">Department</span>{form.employment?.department ?? "—"}</div>
              <div><span className="text-gray-400 text-xs block">Farm site</span>{form.employment?.farm_site ?? "—"}</div>
              <div><span className="text-gray-400 text-xs block">Payment method</span>{form.payment?.method ?? "—"}</div>
            </div>
            {(form.referees ?? []).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Referees</p>
                <ul className="text-sm space-y-2">
                  {form.referees!.map((r, i) => (
                    <li key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                      {r.full_name} · {r.relationship} · {r.phone} · {r.email}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3">HR use only (Section O)</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {hrField("employee_id", "Employee ID assigned")}
              {hrField("company_email", "Company email assigned")}
              {hrField("supervisor_name", "Supervisor name")}
              {hrField("salary_ghs", "Salary / wage (GHS)")}
              {hrField("pay_frequency", "Pay frequency")}
              {hrField("grade_level", "Grade / level")}
              {hrField("fitness_determination", "Fitness determination")}
              {hrField("medical_referral_issued", "Medical referral issued on")}
              {hrField("reference_forms_sent", "Reference forms sent on")}
              {hrField("approved_by", "Approved by")}
            </div>
            <label className="block mt-3">
              <span className="text-xs text-gray-500">HR notes</span>
              <textarea
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                rows={3}
                value={hrData.hr_notes ?? ""}
                onChange={(e) => setHrData((prev) => ({ ...prev, hr_notes: e.target.value }))}
              />
            </label>
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
                  <td className="px-4 py-3 capitalize text-gray-600">{row.job_applications.status}</td>
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
          }}
        />
      )}
    </>
  );
}
