"use client";

import { useEffect, useState } from "react";
import {
  REFEREE_ASSESSMENT_ATTRIBUTES,
  type RefereeRating,
  type RefereeReferenceFormData,
} from "@/lib/careers/refereeReferenceTypes";
import type { RefereeAssessmentAttributeDef } from "@/lib/systemDefinitions/refereeReferenceConfig";
import { FormShell, usePreventBrowserBack } from "@/components/Forms/FormShell";
import { CheckCircle2, Loader2 } from "lucide-react";

type CandidateInfo = {
  full_name: string;
  role_title: string;
  reference_number: string;
};

type RefereeInfo = {
  name: string;
  email: string;
  index: number;
};

type Props = { token: string };

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

const labelClass = "text-xs font-medium text-gray-600";

const RATINGS: RefereeRating[] = ["Excellent", "Good", "Fair", "Poor", "N/A"];

function FieldBlock({
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
      <span className={labelClass}>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default function RefereeReferenceForm({ token }: Props) {
  const [form, setForm] = useState<RefereeReferenceFormData | null>(null);
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);
  const [referee, setReferee] = useState<RefereeInfo | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessmentAttributes, setAssessmentAttributes] = useState<
    RefereeAssessmentAttributeDef[]
  >(REFEREE_ASSESSMENT_ATTRIBUTES.map((a) => ({ key: a.key, label: a.label })));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/careers/reference/${token}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load form.");
        if (cancelled) return;
        const data = json.data;
        setCandidate(data.candidate);
        setReferee(data.referee);
        setExpiresAt(data.expires_at ?? null);
        if (data.submitted) {
          setSubmitted(true);
          setSubmittedAt(data.submitted_at ?? null);
        } else {
          setForm(data.form_data as RefereeReferenceFormData);
          if (Array.isArray(data.assessment_attributes)) {
            setAssessmentAttributes(data.assessment_attributes);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load form.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const patch = (partial: Partial<RefereeReferenceFormData>) => {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
    setError(null);
  };

  const patchReferee = (partial: NonNullable<RefereeReferenceFormData["referee"]>) => {
    setForm((prev) =>
      prev ? { ...prev, referee: { ...prev.referee, ...partial } } : prev,
    );
    setError(null);
  };

  const setRating = (key: string, value: RefereeRating) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            assessment: { ...prev.assessment, [key]: value },
          }
        : prev,
    );
    setError(null);
  };

  const handleSubmit = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/careers/reference/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_data: form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submit failed.");
      setSubmitted(true);
      setSubmittedAt(json.submitted_at ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Loading reference form…">
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </FormShell>
    );
  }

  if (loadError || !candidate || !referee) {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Reference form unavailable">
        <p className="text-sm text-gray-600 text-center py-10">
          {loadError ?? "This link is invalid or has expired."}
        </p>
      </FormShell>
    );
  }

  if (submitted) {
    return <SubmittedView candidate={candidate} referee={referee} submittedAt={submittedAt} />;
  }

  if (!form) return null;

  return (
    <FormShell
      eyebrow="Wills Farms Ltd. — Confidential"
      title="Referee reference form"
      subtitle={`Reference for ${candidate.full_name} · ${candidate.role_title}`}
    >
      <p className="text-xs text-gray-500 mb-6 leading-relaxed">
        Please complete and submit this form directly. Responses are confidential and
        processed under the Data Protection Act, 2012 (Act 843).
        {expiresAt && (
          <>
            {" "}
            Link expires {new Date(expiresAt).toLocaleString("en-GB")}.
          </>
        )}
      </p>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Applicant details</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div>
              <span className="text-gray-400 text-xs block">Applicant name</span>
              <span className="font-medium">{candidate.full_name}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">Position applied for</span>
              <span className="font-medium">{candidate.role_title}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs block">Application reference</span>
              <span className="font-medium">{candidate.reference_number}</span>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Your details</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <FieldBlock label="Full name" required>
              <input
                className={inputClass}
                value={form.referee?.full_name ?? ""}
                onChange={(e) => patchReferee({ full_name: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock label="Organisation & position" required>
              <input
                className={inputClass}
                value={form.referee?.organisation_position ?? ""}
                onChange={(e) => patchReferee({ organisation_position: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock label="Phone">
              <input
                className={inputClass}
                value={form.referee?.phone ?? ""}
                onChange={(e) => patchReferee({ phone: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock label="Email">
              <input className={`${inputClass} bg-gray-50`} readOnly value={form.referee?.email ?? ""} />
            </FieldBlock>
            <FieldBlock label="Relationship to the applicant" required>
              <input
                className={inputClass}
                value={form.referee?.relationship ?? ""}
                onChange={(e) => patchReferee({ relationship: e.target.value })}
              />
            </FieldBlock>
            <div className="sm:col-span-2">
              <FieldBlock
                label="How long, and in what capacity, have you known the applicant?"
                required
              >
                <input
                  className={inputClass}
                  value={form.referee?.known_duration_capacity ?? ""}
                  onChange={(e) => patchReferee({ known_duration_capacity: e.target.value })}
                />
              </FieldBlock>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Assessment</h2>
          <p className="text-xs text-gray-500">
            Rate each attribute. Use N/A if not applicable or unable to comment.
          </p>
          <div className="space-y-3">
            {assessmentAttributes.map((attr) => (
              <div key={attr.key} className="border border-gray-200 rounded-lg p-3">
                <p className="text-sm text-gray-800 mb-2">{attr.label}</p>
                <div className="flex flex-wrap gap-2">
                  {RATINGS.filter((r) => r).map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setRating(attr.key, rating)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                        form.assessment?.[attr.key as keyof NonNullable<typeof form.assessment>] === rating
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-white border-gray-200 text-gray-700"
                      }`}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Questions</h2>
          <FieldBlock
            label="What were the applicant's main duties when you worked with them?"
            required
          >
            <textarea
              className={`${inputClass} min-h-[100px]`}
              value={form.main_duties ?? ""}
              onChange={(e) => patch({ main_duties: e.target.value })}
            />
          </FieldBlock>
          <div>
            <p className={`${labelClass} mb-2`}>
              Would you re-employ or recommend this person? <span className="text-red-600">*</span>
            </p>
            <div className="flex gap-2 mb-3">
              {(["Yes", "No"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => patch({ would_recommend: v })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                    form.would_recommend === v
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-white border-gray-200"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <FieldBlock label="Please explain" required>
              <textarea
                className={`${inputClass} min-h-[80px]`}
                value={form.recommend_explanation ?? ""}
                onChange={(e) => patch({ recommend_explanation: e.target.value })}
              />
            </FieldBlock>
          </div>
          <FieldBlock label="Any concerns relevant to this role at a biosecure livestock company?">
            <textarea
              className={`${inputClass} min-h-[80px]`}
              value={form.concerns ?? ""}
              onChange={(e) => patch({ concerns: e.target.value })}
            />
          </FieldBlock>
          <FieldBlock label="Any other comments">
            <textarea
              className={`${inputClass} min-h-[80px]`}
              value={form.other_comments ?? ""}
              onChange={(e) => patch({ other_comments: e.target.value })}
            />
          </FieldBlock>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Declaration</h2>
          <p className="text-sm text-gray-600">
            I confirm that the information provided above is true and accurate to the best of my
            knowledge.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <FieldBlock label="Typed full name (signature)" required>
              <input
                className={inputClass}
                value={form.declaration?.signature_name ?? ""}
                onChange={(e) =>
                  patch({
                    declaration: { ...form.declaration, signature_name: e.target.value },
                  })
                }
              />
            </FieldBlock>
            <FieldBlock label="Date" required>
              <input
                className={inputClass}
                type="date"
                value={form.declaration?.signature_date ?? ""}
                onChange={(e) =>
                  patch({
                    declaration: { ...form.declaration, signature_date: e.target.value },
                  })
                }
              />
            </FieldBlock>
          </div>
        </section>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSubmit()}
        className="mt-8 w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting…
          </>
        ) : (
          "Submit reference"
        )}
      </button>
    </FormShell>
  );
}

function SubmittedView({
  candidate,
  referee,
  submittedAt,
}: {
  candidate: CandidateInfo;
  referee: RefereeInfo;
  submittedAt: string | null;
}) {
  usePreventBrowserBack(true);

  return (
    <FormShell eyebrow="Wills Farms Ltd." title="Reference submitted">
      <div className="text-center py-8">
        <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-4" />
        <p className="text-gray-600 text-sm leading-relaxed">
          Thank you, {referee.name.split(/\s+/)[0]}. Your confidential reference for{" "}
          {candidate.full_name} has been received by Wills Farms HR.
        </p>
        {submittedAt && (
          <p className="text-xs text-gray-400 mt-4">
            Submitted {new Date(submittedAt).toLocaleString("en-GB")}
          </p>
        )}
      </div>
    </FormShell>
  );
}
