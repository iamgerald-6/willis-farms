"use client";

import { useState } from "react";
import {
  GHANA_REGIONS,
  ONBOARDING_STEP_LABELS,
  mergeOnboardingForm,
  type OnboardingFormData,
  type OnboardingStep,
} from "@/lib/careers/onboardingTypes";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type ApplicationInfo = {
  full_name: string;
  email: string;
  phone: string;
  role_title: string;
  reference_number: string;
};

type Props = {
  token: string;
  application: ApplicationInfo;
  initialForm: OnboardingFormData;
  expiresAt: string;
};

const STEPS: OnboardingStep[] = ["personal", "medical", "referee"];

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

export default function OnboardingWizard({
  token,
  application,
  initialForm,
  expiresAt,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<OnboardingFormData>(() =>
    mergeOnboardingForm(initialForm),
  );
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex];

  const patch = (partial: Partial<OnboardingFormData>) => {
    setForm((prev) => mergeOnboardingForm({ ...prev, ...partial }));
  };

  const saveStep = async (opts: { finalize?: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/careers/onboarding/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step,
          form_data: form,
          finalize: opts.finalize ?? false,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      if (opts.finalize) {
        setSubmitted(true);
      } else if (stepIndex < STEPS.length - 1) {
        setStepIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4">
        <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900">Onboarding submitted</h1>
        <p className="text-gray-600 mt-3 text-sm leading-relaxed">
          Thank you, {application.full_name.split(/\s+/)[0]}. Your information has been sent to
          Wills Farms HR. We will contact you regarding medical examination and next steps.
        </p>
        <p className="text-xs text-gray-400 mt-6">Reference {application.reference_number}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
          Wills Farms Ltd. — Employee onboarding
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">{application.full_name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {application.role_title} · Ref {application.reference_number}
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Link expires {new Date(expiresAt).toLocaleString("en-GB")}
        </p>
      </div>

      <div className="flex gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full ${i <= stepIndex ? "bg-red-600" : "bg-gray-200"}`}
          />
        ))}
      </div>
      <p className="text-sm font-semibold text-gray-800 mb-1">
        Step {stepIndex + 1} of {STEPS.length}
      </p>
      <p className="text-xs text-gray-500 mb-6">{ONBOARDING_STEP_LABELS[step]}</p>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {step === "personal" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">A. Personal information</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Surname" required>
                <input className={inputClass} value={form.personal?.surname ?? ""} onChange={(e) => patch({ personal: { ...form.personal, surname: e.target.value } })} />
              </Field>
              <Field label="First name" required>
                <input className={inputClass} value={form.personal?.first_name ?? ""} onChange={(e) => patch({ personal: { ...form.personal, first_name: e.target.value } })} />
              </Field>
              <Field label="Middle name(s)">
                <input className={inputClass} value={form.personal?.middle_names ?? ""} onChange={(e) => patch({ personal: { ...form.personal, middle_names: e.target.value } })} />
              </Field>
              <Field label="Date of birth (DD/MM/YYYY)" required>
                <input className={inputClass} placeholder="DD/MM/YYYY" value={form.personal?.date_of_birth ?? ""} onChange={(e) => patch({ personal: { ...form.personal, date_of_birth: e.target.value } })} />
              </Field>
              <Field label="Gender" required>
                <input className={inputClass} value={form.personal?.gender ?? ""} onChange={(e) => patch({ personal: { ...form.personal, gender: e.target.value } })} />
              </Field>
              <Field label="Nationality" required>
                <input className={inputClass} value={form.personal?.nationality ?? ""} onChange={(e) => patch({ personal: { ...form.personal, nationality: e.target.value } })} />
              </Field>
              <Field label="Ghana Card No." required>
                <input className={inputClass} placeholder="GHA-XXXXXXXXX-X" value={form.personal?.ghana_card_no ?? ""} onChange={(e) => patch({ personal: { ...form.personal, ghana_card_no: e.target.value } })} />
              </Field>
              <Field label="SSNIT number" required>
                <input className={inputClass} value={form.personal?.ssnit_number ?? ""} onChange={(e) => patch({ personal: { ...form.personal, ssnit_number: e.target.value } })} />
              </Field>
              <Field label="Mobile number" required>
                <input className={inputClass} value={form.personal?.mobile ?? ""} onChange={(e) => patch({ personal: { ...form.personal, mobile: e.target.value } })} />
              </Field>
              <Field label="Personal email">
                <input className={inputClass} type="email" value={form.personal?.personal_email ?? ""} onChange={(e) => patch({ personal: { ...form.personal, personal_email: e.target.value } })} />
              </Field>
              <Field label="Region" required>
                <select className={inputClass} value={form.personal?.region ?? ""} onChange={(e) => patch({ personal: { ...form.personal, region: e.target.value } })}>
                  <option value="">Select region</option>
                  {GHANA_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Residential address" required>
              <textarea className={inputClass} rows={2} value={form.personal?.residential_address ?? ""} onChange={(e) => patch({ personal: { ...form.personal, residential_address: e.target.value } })} />
            </Field>
            <Field label="Ghana Post GPS digital address" required>
              <input className={inputClass} value={form.personal?.gps_address ?? ""} onChange={(e) => patch({ personal: { ...form.personal, gps_address: e.target.value } })} />
            </Field>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">B. Emergency contact & next of kin</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Emergency contact name" required>
                <input className={inputClass} value={form.emergency?.full_name ?? ""} onChange={(e) => patch({ emergency: { ...form.emergency, full_name: e.target.value } })} />
              </Field>
              <Field label="Relationship" required>
                <input className={inputClass} value={form.emergency?.relationship ?? ""} onChange={(e) => patch({ emergency: { ...form.emergency, relationship: e.target.value } })} />
              </Field>
              <Field label="Phone" required>
                <input className={inputClass} value={form.emergency?.phone ?? ""} onChange={(e) => patch({ emergency: { ...form.emergency, phone: e.target.value } })} />
              </Field>
              <Field label="Next of kin name" required>
                <input className={inputClass} value={form.next_of_kin?.full_name ?? ""} onChange={(e) => patch({ next_of_kin: { ...form.next_of_kin, full_name: e.target.value } })} />
              </Field>
              <Field label="Next of kin phone" required>
                <input className={inputClass} value={form.next_of_kin?.phone ?? ""} onChange={(e) => patch({ next_of_kin: { ...form.next_of_kin, phone: e.target.value } })} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">D. Employment & E. Payment</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Position title" required>
                <input className={inputClass} value={form.employment?.position_title ?? ""} onChange={(e) => patch({ employment: { ...form.employment, position_title: e.target.value } })} />
              </Field>
              <Field label="Department / division" required>
                <input className={inputClass} value={form.employment?.department ?? ""} onChange={(e) => patch({ employment: { ...form.employment, department: e.target.value } })} />
              </Field>
              <Field label="Farm site / work location" required>
                <input className={inputClass} value={form.employment?.farm_site ?? ""} onChange={(e) => patch({ employment: { ...form.employment, farm_site: e.target.value } })} />
              </Field>
              <Field label="Employment type" required>
                <select className={inputClass} value={form.employment?.employment_type ?? ""} onChange={(e) => patch({ employment: { ...form.employment, employment_type: e.target.value } })}>
                  <option value="">Select</option>
                  {["Full-time", "Part-time", "Casual", "Seasonal", "Contract"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Payment method" required>
                <select className={inputClass} value={form.payment?.method ?? ""} onChange={(e) => patch({ payment: { ...form.payment, method: e.target.value } })}>
                  <option value="">Select</option>
                  <option value="Bank transfer">Bank transfer</option>
                  <option value="Mobile money">Mobile money</option>
                </select>
              </Field>
              <Field label="Bank / mobile money details">
                <input className={inputClass} placeholder="Bank name or MoMo network" value={form.payment?.bank_name ?? form.payment?.momo_network ?? ""} onChange={(e) => patch({ payment: { ...form.payment, bank_name: e.target.value } })} />
              </Field>
              <Field label="Account / MoMo number">
                <input className={inputClass} value={form.payment?.account_number ?? form.payment?.momo_number ?? ""} onChange={(e) => patch({ payment: { ...form.payment, account_number: e.target.value, momo_number: e.target.value } })} />
              </Field>
            </div>
          </section>
        </div>
      )}

      {step === "medical" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">F–H. Qualifications, experience & skills</h2>
            <Field label="Highest qualification">
              <input className={inputClass} value={form.qualifications?.[0]?.qualification ?? ""} onChange={(e) => {
                const q = [...(form.qualifications ?? [])];
                q[0] = { ...q[0], qualification: e.target.value };
                patch({ qualifications: q });
              }} />
            </Field>
            <Field label="Institution">
              <input className={inputClass} value={form.qualifications?.[0]?.institution ?? ""} onChange={(e) => {
                const q = [...(form.qualifications ?? [])];
                q[0] = { ...q[0], institution: e.target.value };
                patch({ qualifications: q });
              }} />
            </Field>
            <Field label="Most recent employer">
              <input className={inputClass} value={form.work_experience?.[0]?.employer ?? ""} onChange={(e) => {
                const w = [...(form.work_experience ?? [])];
                w[0] = { ...w[0], employer: e.target.value };
                patch({ work_experience: w });
              }} />
            </Field>
            <Field label="Relevant skills">
              <textarea className={inputClass} rows={3} value={form.skills?.relevant_skills ?? ""} onChange={(e) => patch({ skills: { ...form.skills, relevant_skills: e.target.value } })} />
            </Field>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">I. Medical & safety self-declaration</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Blood group">
                <input className={inputClass} value={form.medical?.blood_group ?? ""} onChange={(e) => patch({ medical: { ...form.medical, blood_group: e.target.value } })} />
              </Field>
              <Field label="Allergies">
                <input className={inputClass} value={form.medical?.allergies ?? ""} onChange={(e) => patch({ medical: { ...form.medical, allergies: e.target.value } })} />
              </Field>
            </div>
            <Field label="Medical conditions relevant to assigned duties">
              <textarea className={inputClass} rows={2} value={form.medical?.conditions ?? ""} onChange={(e) => patch({ medical: { ...form.medical, conditions: e.target.value } })} />
            </Field>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1 accent-red-600"
                checked={form.medical?.acknowledge_referral ?? false}
                onChange={(e) => patch({ medical: { ...form.medical, acknowledge_referral: e.target.checked } })}
              />
              <span>
                I understand that after submission, HR will issue a Medical Examination Referral for evaluation at Wills Farms&apos; designated facility. The facility submits the report directly to HR.
              </span>
            </label>
          </section>
        </div>
      )}

      {step === "referee" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">J. References (two required)</h2>
            {(form.referees ?? []).map((ref, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500">Referee {i + 1}</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Full name" required>
                    <input className={inputClass} value={ref.full_name ?? ""} onChange={(e) => {
                      const refs = [...(form.referees ?? [])];
                      refs[i] = { ...refs[i], full_name: e.target.value };
                      patch({ referees: refs });
                    }} />
                  </Field>
                  <Field label="Relationship" required>
                    <input className={inputClass} value={ref.relationship ?? ""} onChange={(e) => {
                      const refs = [...(form.referees ?? [])];
                      refs[i] = { ...refs[i], relationship: e.target.value };
                      patch({ referees: refs });
                    }} />
                  </Field>
                  <Field label="Phone" required>
                    <input className={inputClass} value={ref.phone ?? ""} onChange={(e) => {
                      const refs = [...(form.referees ?? [])];
                      refs[i] = { ...refs[i], phone: e.target.value };
                      patch({ referees: refs });
                    }} />
                  </Field>
                  <Field label="Email" required>
                    <input className={inputClass} type="email" value={ref.email ?? ""} onChange={(e) => {
                      const refs = [...(form.referees ?? [])];
                      refs[i] = { ...refs[i], email: e.target.value };
                      patch({ referees: refs });
                    }} />
                  </Field>
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">K. Biosecurity declaration</h2>
            {[
              { key: "household_pigs" as const, label: "Do you or anyone in your household keep pigs or have contact with pigs outside work?" },
              { key: "household_pig_work" as const, label: "Does any household member work on another pig farm, animal market, or slaughter facility?" },
              { key: "visited_swine_site_12m" as const, label: "Have you worked on or visited any other swine site in the past 12 months?" },
              { key: "asf_travel_30d" as const, label: "Have you travelled to a region affected by African Swine Fever in the past 30 days?" },
            ].map(({ key, label }) => (
              <div key={key} className="text-sm">
                <p className="text-gray-700 mb-1">{label}</p>
                <div className="flex gap-2">
                  {(["yes", "no"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => patch({ biosecurity: { ...form.biosecurity, [key]: v } })}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border ${form.biosecurity?.[key] === v ? "bg-red-600 text-white border-red-600" : "bg-white border-gray-200"}`}
                    >
                      {v === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Field label="Biosecurity commitment initials">
              <input className={inputClass} value={form.biosecurity?.commitment_initials ?? ""} onChange={(e) => patch({ biosecurity: { ...form.biosecurity, commitment_initials: e.target.value } })} />
            </Field>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-900">L & N. Declarations</h2>
            <Field label="Typed full name (signature)">
              <input className={inputClass} value={form.declarations?.signature_name ?? ""} onChange={(e) => patch({ declarations: { ...form.declarations, signature_name: e.target.value } })} />
            </Field>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1 accent-red-600"
                checked={form.declarations?.data_consent ?? false}
                onChange={(e) => patch({ declarations: { ...form.declarations, data_consent: e.target.checked } })}
              />
              <span>
                I consent to the collection and processing of my personal data for employment administration, and I certify that the information provided is accurate and complete.
              </span>
            </label>
          </section>
        </div>
      )}

      <div className="flex gap-2 mt-8 pt-6 border-t border-gray-100">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => setStepIndex((i) => i - 1)}
            disabled={saving}
            className="inline-flex items-center gap-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            saveStep({ finalize: stepIndex === STEPS.length - 1 })
          }
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : stepIndex === STEPS.length - 1 ? (
            "Submit onboarding"
          ) : (
            <>
              Save & continue
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
