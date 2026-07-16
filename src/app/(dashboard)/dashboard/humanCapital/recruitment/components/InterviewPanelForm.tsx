"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  computeWeightedScore,
  RATING_LABELS,
  type InterviewGuideConfig,
} from "@/lib/careers/interviewFormConfigs";
import {
  PANEL_DECISIONS,
  type InterviewFormData,
  type PanelDecision,
} from "@/lib/careers/types";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  applicationId: string;
  adminId: string;
  onClose: () => void;
  onSaved: () => void;
};

function emptyForm(): InterviewFormData {
  return {
    panel: {},
    screening: {},
    question_ratings: {},
    scenario_ratings: {},
    disqualifiers: {},
    summary: { decision: "" },
  };
}

function RatingRow({
  id,
  label,
  lookFor,
  value,
  notes,
  onChange,
}: {
  id: string;
  label: string;
  lookFor?: string;
  value: number | null;
  notes: string;
  onChange: (rating: number | null, notes: string) => void;
}) {
  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {lookFor && (
          <p className="text-xs text-gray-500 mt-1">
            <span className="font-semibold">Look for:</span> {lookFor}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n, notes)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              value === n
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
            }`}
            title={RATING_LABELS[n]}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => onChange(value, e.target.value)}
        rows={2}
        placeholder="Evidence-based notes"
        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2"
      />
    </div>
  );
}

export default function InterviewPanelForm({
  applicationId,
  adminId,
  onClose,
  onSaved,
}: Props) {
  const [formData, setFormData] = useState<InterviewFormData>(emptyForm());
  const [guide, setGuide] = useState<InterviewGuideConfig | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");

  const { isLoading } = useQuery({
    queryKey: ["interview_guide", applicationId],
    queryFn: async () => {
      const res = await api.get(
        `/careers/interview?application_id=${applicationId}`,
      );
      const { application, guide: g } = res.data.data;
      setCandidateName(application.full_name);
      setReferenceNumber(application.reference_number);
      setGuide(g);
      setFormData({
        ...emptyForm(),
        ...(application.interview_form_data ?? {}),
      });
      return res.data.data;
    },
  });

  const scores = useMemo(() => {
    if (!guide) return { areaScores: {}, total: null };
    return computeWeightedScore(
      guide,
      formData.question_ratings ?? {},
      formData.scenario_ratings ?? {},
    );
  }, [guide, formData.question_ratings, formData.scenario_ratings]);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      summary: {
        ...prev.summary,
        area_scores: scores.areaScores,
        total_weighted: scores.total,
      },
    }));
  }, [scores.areaScores, scores.total]);

  const saveMutation = useMutation({
    mutationFn: (finalize: boolean) =>
      api.post("/careers/interview", {
        application_id: applicationId,
        interview_form_data: formData,
        submitted_by: adminId,
        finalize,
      }),
    onSuccess: (_, finalize) => {
      toast.success(finalize ? "Interview submitted." : "Draft saved.");
      onSaved();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Save failed.");
    },
  });

  const updateQuestion = (
    id: string,
    rating: number | null,
    notes: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      question_ratings: {
        ...prev.question_ratings,
        [id]: { rating, notes },
      },
    }));
  };

  const updateScenario = (
    id: string,
    rating: number | null,
    notes: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      scenario_ratings: {
        ...prev.scenario_ratings,
        [id]: { rating, notes },
      },
    }));
  };

  const updateScreening = (
    id: string,
    pass: "yes" | "no" | "",
    notes: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      screening: {
        ...prev.screening,
        [id]: { pass, notes },
      },
    }));
  };

  const updateDisqualifier = (
    id: string,
    observed: "yes" | "no" | "",
    notes: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      disqualifiers: {
        ...prev.disqualifiers,
        [id]: { observed, notes },
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl max-h-[95vh] flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
              Internal — panel use only
            </p>
            <h2 className="text-lg font-bold text-gray-900 mt-1">
              {guide?.title ?? "Interview guide"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {candidateName} · Ref {referenceNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-8">
          {isLoading || !guide ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <section className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-900">
                <p className="font-semibold">Interviewer briefing</p>
                <p className="mt-2 leading-relaxed">{guide.briefing}</p>
                <p className="mt-3 text-xs">
                  Panel: {guide.recommendedPanel} · {guide.duration}
                </p>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-3">
                  Panel details
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {(
                    [
                      ["chair", "Panel chair"],
                      ["member_2", "Panel member 2"],
                      ["member_3", "Panel member 3"],
                      ["interview_date", "Interview date"],
                      ["location", "Location"],
                    ] as const
                  ).map(([key, label]) => (
                    <input
                      key={key}
                      type={key === "interview_date" ? "date" : "text"}
                      placeholder={label}
                      value={formData.panel?.[key] ?? ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          panel: { ...prev.panel, [key]: e.target.value },
                        }))
                      }
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-3">
                  Section A — Screening (pass/fail)
                </h3>
                <div className="space-y-3">
                  {guide.screening.map((item) => (
                    <div
                      key={item.id}
                      className="border border-gray-100 rounded-xl p-4"
                    >
                      <p className="text-sm text-gray-900">
                        <span className="font-mono text-xs text-gray-400 mr-2">
                          {item.id}
                        </span>
                        {item.requirement}
                        {item.mandatory && (
                          <span className="text-red-500 text-xs ml-1">*</span>
                        )}
                      </p>
                      <div className="flex gap-2 mt-3">
                        {(["yes", "no", ""] as const).map((v) => (
                          <button
                            key={v || "blank"}
                            type="button"
                            onClick={() =>
                              updateScreening(
                                item.id,
                                v,
                                formData.screening?.[item.id]?.notes ?? "",
                              )
                            }
                            className={`px-3 py-1 rounded-lg text-xs font-medium border ${
                              formData.screening?.[item.id]?.pass === v
                                ? "bg-gray-900 text-white border-gray-900"
                                : "bg-white text-gray-600 border-gray-200"
                            }`}
                          >
                            {v === "yes" ? "Yes" : v === "no" ? "No" : "—"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-3">
                  Section B — Structured questions
                </h3>
                <div className="space-y-4">
                  {guide.questions.map((q) => (
                    <RatingRow
                      key={q.id}
                      id={q.id}
                      label={`${q.id} · ${q.section} — ${q.question}`}
                      lookFor={q.lookFor}
                      value={
                        formData.question_ratings?.[q.id]?.rating ?? null
                      }
                      notes={formData.question_ratings?.[q.id]?.notes ?? ""}
                      onChange={(rating, notes) =>
                        updateQuestion(q.id, rating, notes)
                      }
                    />
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-3">
                  Section C — Scenarios / practical
                </h3>
                <div className="space-y-4">
                  {guide.scenarios.map((s) => (
                    <RatingRow
                      key={s.id}
                      id={s.id}
                      label={`${s.id} — ${s.title}`}
                      lookFor={s.observe}
                      value={
                        formData.scenario_ratings?.[s.id]?.rating ?? null
                      }
                      notes={formData.scenario_ratings?.[s.id]?.notes ?? ""}
                      onChange={(rating, notes) =>
                        updateScenario(s.id, rating, notes)
                      }
                    />
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-3">
                  Section D — Evaluation summary
                </h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  {guide.weights.map((row) => (
                    <div
                      key={row.area}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-gray-600">{row.area}</span>
                      <span className="font-medium text-gray-900">
                        {scores.areaScores[row.area]?.toFixed(2) ?? "—"}{" "}
                        <span className="text-gray-400 text-xs">
                          ({row.weight}%)
                        </span>
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 pt-3 flex justify-between font-bold">
                    <span>Total weighted score</span>
                    <span>{scores.total?.toFixed(2) ?? "—"} / 5.00</span>
                  </div>
                  <p className="text-xs text-gray-500">{guide.interpretation}</p>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    Panel decision
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PANEL_DECISIONS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            summary: {
                              ...prev.summary,
                              decision: d.value as PanelDecision,
                            },
                          }))
                        }
                        className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                          formData.summary?.decision === d.value
                            ? "bg-red-600 text-white border-red-600"
                            : "bg-white text-gray-700 border-gray-200"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={formData.summary?.decision_notes ?? ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        summary: {
                          ...prev.summary,
                          decision_notes: e.target.value,
                        },
                      }))
                    }
                    rows={3}
                    placeholder="Decision rationale and conditions"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-3">
                  Automatic disqualifiers
                </h3>
                <div className="space-y-2">
                  {guide.disqualifiers.map((d, i) => (
                    <div
                      key={i}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 border border-red-100 bg-red-50/50 rounded-lg p-3"
                    >
                      <p className="text-sm text-red-900 flex-1">{d}</p>
                      <div className="flex gap-1">
                        {(["yes", "no", ""] as const).map((v) => (
                          <button
                            key={v || "blank"}
                            type="button"
                            onClick={() =>
                              updateDisqualifier(
                                `dq_${i}`,
                                v,
                                formData.disqualifiers?.[`dq_${i}`]?.notes ?? "",
                              )
                            }
                            className={`px-2 py-1 rounded text-xs font-medium border ${
                              formData.disqualifiers?.[`dq_${i}`]?.observed ===
                              v
                                ? "bg-red-600 text-white border-red-600"
                                : "bg-white border-gray-200"
                            }`}
                          >
                            {v === "yes" ? "Observed" : v === "no" ? "No" : "—"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            type="button"
            onClick={() => saveMutation.mutate(false)}
            disabled={saveMutation.isPending || isLoading}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            Save draft
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate(true)}
            disabled={saveMutation.isPending || isLoading}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
          >
            {saveMutation.isPending ? "Submitting…" : "Submit interview"}
          </button>
        </div>
      </div>
    </div>
  );
}
