"use client";

import { useEffect, useState } from "react";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import type { StageSubmissionData } from "@/lib/careers/types";
import { FormShell } from "@/components/Forms/FormShell";
import { Loader2, CheckCircle2, Clock3 } from "lucide-react";
import { RatingRow, StageInfoBanner } from "@/app/(dashboard)/dashboard/humanCapital/recruitment/components/interview/shared";

type PanelDataLocked = {
  locked: true;
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
  stage: 1 | 2;
};

type PanelDataOpen = {
  locked?: false;
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
  memberName: string;
  stage: 1 | 2;
  guide: InterviewGuideConfig;
  submission: StageSubmissionData | null;
  submitted: boolean;
};

/** Stage 1 forms report `locked: true` until HR opens them once the interview starts. */
type PanelData = PanelDataLocked | PanelDataOpen;

type Props = { token: string };

export default function PanelInterviewWizard({ token }: Props) {
  const [submission, setSubmission] = useState<StageSubmissionData>({
    screening: {},
    question_ratings: {},
    scenario_ratings: {},
  });
  const [submitted, setSubmitted] = useState(false);
  const [data, setData] = useState<PanelData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/careers/interview/panel/${token}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to load interview.");
        }
        if (!cancelled) {
          setData(json.data as PanelData);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load interview.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/careers/interview/panel/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Submit failed.");
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <FormShell eyebrow="Interview panel" title="Loading…">
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </FormShell>
    );
  }

  if (loadError || !data) {
    return (
      <FormShell eyebrow="Interview panel" title="Link unavailable">
        <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-xl p-6">
          {loadError ?? "This interview link is invalid or has expired."}
        </p>
      </FormShell>
    );
  }

  if (data.locked) {
    return (
      <FormShell
        eyebrow="Interview panel"
        title="Not open yet"
        subtitle={`${data.candidateName} · Ref ${data.referenceNumber}`}
      >
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex gap-3">
          <Clock3 className="w-6 h-6 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-900">
              This form will be accessible on the day of the interview.
            </p>
            <p className="text-sm text-amber-800 mt-1">
              Your Stage {data.stage} evaluation form for {data.candidateName} (
              {data.roleTitle}) opens once HR starts the interview. Check back then, or
              use this same link again.
            </p>
          </div>
        </div>
      </FormShell>
    );
  }

  if (data.submitted || submitted) {
    return (
      <FormShell
        eyebrow="Interview panel"
        title="Thank you"
        subtitle={`${data.candidateName} · Ref ${data.referenceNumber}`}
      >
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
          <div>
            <p className="font-semibold text-green-900">Your evaluation has been submitted.</p>
            <p className="text-sm text-green-800 mt-1">
              Stage {data.stage} scores for {data.candidateName} ({data.roleTitle}) are recorded.
              Human Capital will follow up if anything else is needed.
            </p>
          </div>
        </div>
      </FormShell>
    );
  }

  const guide = data.guide;
  const stage = data.stage;

  const updateScreening = (id: string, pass: "yes" | "no" | "", notes: string) => {
    setSubmission((prev) => ({
      ...prev,
      screening: { ...prev.screening, [id]: { pass, notes } },
    }));
  };

  const updateQuestion = (id: string, rating: number | null, notes: string) => {
    setSubmission((prev) => ({
      ...prev,
      question_ratings: { ...prev.question_ratings, [id]: { rating, notes } },
    }));
  };

  const updateScenario = (id: string, rating: number | null, notes: string) => {
    setSubmission((prev) => ({
      ...prev,
      scenario_ratings: { ...prev.scenario_ratings, [id]: { rating, notes } },
    }));
  };

  return (
    <FormShell
      eyebrow="Interview panel — no login required"
      title={`Stage ${stage} evaluation`}
      subtitle={`${data.candidateName} · ${data.roleTitle} · Ref ${data.referenceNumber} · Panel: ${data.memberName}`}
    >
      <div className="space-y-8">
        <StageInfoBanner
          stage={stage}
          title={
            stage === 1
              ? "Screening & structured questions (Sections A & B)"
              : "Scenarios & practical assessment (Section C)"
          }
          duration={
            stage === 1 ? guide.stageDurations.stage1 : guide.stageDurations.stage2
          }
          totalDuration={guide.duration}
        />

        {stage === 1 && (
          <>
            <section>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Section A — Screening</h3>
              <div className="space-y-3">
                {guide.screening.map((item) => (
                  <div key={item.id} className="border border-gray-100 rounded-xl p-4 bg-white">
                    <p className="text-sm text-gray-900">
                      <span className="font-mono text-xs text-gray-400 mr-2">{item.id}</span>
                      {item.requirement}
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
                              submission.screening?.[item.id]?.notes ?? "",
                            )
                          }
                          className={`px-3 py-1 rounded-lg text-xs font-medium border ${
                            submission.screening?.[item.id]?.pass === v
                              ? "bg-red-600 text-white border-red-600"
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
              <h3 className="text-sm font-bold text-gray-900 mb-3">Section B — Structured questions</h3>
              <div className="space-y-4">
                {guide.questions.map((q) => (
                  <RatingRow
                    key={q.id}
                    label={`${q.id} · ${q.section} — ${q.question}`}
                    lookFor={q.lookFor}
                    value={submission.question_ratings?.[q.id]?.rating ?? null}
                    notes={submission.question_ratings?.[q.id]?.notes ?? ""}
                    onChange={(rating, notes) => updateQuestion(q.id, rating, notes)}
                  />
                ))}
              </div>
            </section>
          </>
        )}

        {stage === 2 && (
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3">Section C — Scenarios / practical</h3>
            <div className="space-y-4">
              {guide.scenarios.map((s) => (
                <RatingRow
                  key={s.id}
                  label={`${s.id} — ${s.title}`}
                  lookFor={s.observe}
                  value={submission.scenario_ratings?.[s.id]?.rating ?? null}
                  notes={submission.scenario_ratings?.[s.id]?.notes ?? ""}
                  onChange={(rating, notes) => updateScenario(s.id, rating, notes)}
                />
              ))}
            </div>
          </section>
        )}

        {submitError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            {submitError}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-3 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit Stage {stage} evaluation
        </button>
      </div>
    </FormShell>
  );
}
