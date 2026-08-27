"use client";

import { useState } from "react";
import {
  computeWeightedScore,
  ratingLabelForGuide,
} from "@/lib/careers/interviewFormConfigs";
import {
  DEFAULT_INTERVIEW_EVALUATION_LABELS,
} from "@/lib/systemDefinitions/interviewEvaluationConfig";
import {
  observedDisqualifiers,
  scoreStanding,
  standingLabel,
} from "@/lib/careers/panelDecision";
import type { InterviewFormData, StageSubmissionData } from "@/lib/careers/types";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import {
  gradersForStage,
  getSubmission,
  stageAverage,
  type GraderResult,
} from "@/lib/careers/panelInterview";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { StageInfoBanner } from "./shared";
import GraderSubmissionModal from "./GraderSubmissionModal";

type SelectedGrader = { grader: GraderResult; stage: 1 | 2 };

const RECOMMENDATION_LABELS: Record<string, string> = {
  hire: "Hire",
  hold: "Hold / reserve",
  do_not_hire: "Do not hire",
};

const RECOMMENDATION_CLASSES: Record<string, string> = {
  hire: "bg-green-100 text-green-800",
  hold: "bg-amber-100 text-amber-800",
  do_not_hire: "bg-red-100 text-red-800",
};

function GraderMatrix({
  formData,
  guide,
  stage,
  onGraderClick,
}: {
  formData: InterviewFormData;
  guide: InterviewGuideConfig;
  stage: 1 | 2;
  onGraderClick: (grader: GraderResult, stage: 1 | 2) => void;
}) {
  const graders = gradersForStage(formData, guide, stage);
  const avg = stageAverage(formData, guide, stage);

  if (graders.length === 0) {
    return <p className="text-xs text-gray-400">No graders for this stage.</p>;
  }

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-xl mb-4">
      <table className="w-full text-sm min-w-[400px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-2 font-semibold text-gray-600">Grader</th>
            <th className="text-center px-4 py-2 font-semibold text-gray-600">Score</th>
            <th className="text-center px-4 py-2 font-semibold text-gray-600">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {graders.map((g) => (
            <tr
              key={g.id}
              onClick={() => g.submitted_at && onGraderClick(g, stage)}
              className={`border-b border-gray-100 ${
                g.submitted_at ? "cursor-pointer hover:bg-gray-50" : ""
              }`}
              title={g.submitted_at ? "View filled form" : undefined}
            >
              <td className="px-4 py-2 text-gray-900">
                {g.submitted_at ? (
                  <span className="text-red-700 hover:underline">{g.label}</span>
                ) : (
                  g.label
                )}
                <span className="text-xs text-gray-400 ml-1">({g.role})</span>
              </td>
              <td className="px-4 py-2 text-center font-medium">
                {g.total?.toFixed(2) ?? "—"}
              </td>
              <td className="px-4 py-2 text-center text-xs text-gray-500">
                {g.submitted_at
                  ? new Date(g.submitted_at).toLocaleDateString("en-GB")
                  : "Pending"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold">
            <td className="px-4 py-2">Stage {stage} average</td>
            <td className="px-4 py-2 text-center text-red-700">
              {avg?.toFixed(2) ?? "—"}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  scores: ReturnType<typeof computeWeightedScore>;
  onChange: (data: InterviewFormData) => void;
  readOnly?: boolean;
  onGenerateAnalysis?: () => void;
  isGeneratingAnalysis?: boolean;
  evaluationLabels?: {
    observed: string;
    notObserved: string;
    neutral: string;
  };
};

const STANDING_CLASSES: Record<string, string> = {
  strong_hire: "text-green-800 bg-green-100",
  hire: "text-blue-800 bg-blue-100",
  hold: "text-amber-800 bg-amber-100",
  do_not_hire: "text-red-800 bg-red-100",
  incomplete: "text-gray-600 bg-gray-100",
};

export default function Stage3Evaluation({
  guide,
  formData,
  scores,
  onChange,
  readOnly = false,
  onGenerateAnalysis,
  isGeneratingAnalysis = false,
  evaluationLabels = DEFAULT_INTERVIEW_EVALUATION_LABELS,
}: Props) {
  const updateDisqualifier = (
    id: string,
    observed: "yes" | "no" | "",
    notes: string,
  ) => {
    if (readOnly) return;
    onChange({
      ...formData,
      disqualifiers: {
        ...formData.disqualifiers,
        [id]: { observed, notes },
      },
    });
  };

  const total = scores.total;
  const standing = scoreStanding(total);
  const standingClass = STANDING_CLASSES[standing];
  const observedDqs = observedDisqualifiers(
    formData,
    guide.disqualifiers,
    guide.disqualifierItems,
  );

  const disqualifierRows =
    guide.disqualifierItems ??
    guide.disqualifiers.map((label, i) => ({ id: `dq_${i}`, label }));

  const [selected, setSelected] = useState<SelectedGrader | null>(null);
  const submissionForGrader = (g: GraderResult, stage: 1 | 2): StageSubmissionData | undefined => {
    if (g.role === "hr") {
      return stage === 1 ? formData.hr_submission?.stage1 : formData.hr_submission?.stage2;
    }
    return getSubmission(formData, g.id, stage);
  };

  return (
    <div className="space-y-8">
      <StageInfoBanner
        stage={3}
        title="Final evaluation — all panel scores"
        duration={guide.stageDurations.stage3}
        totalDuration={guide.duration}
      />

      <section>
        <h3 className="text-sm font-bold text-gray-900 mb-3">Stage 1 scores</h3>
        <GraderMatrix
          formData={formData}
          guide={guide}
          stage={1}
          onGraderClick={(grader, stage) => setSelected({ grader, stage })}
        />
      </section>

      <section>
        <h3 className="text-sm font-bold text-gray-900 mb-3">Stage 2 scores</h3>
        <GraderMatrix
          formData={formData}
          guide={guide}
          stage={2}
          onGraderClick={(grader, stage) => setSelected({ grader, stage })}
        />
      </section>

      {observedDqs.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Critical concern(s) noted
            </p>
            <p className="text-xs text-amber-800 mt-1">
              For HR awareness only — does not automatically change the hire decision.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-900">
              {observedDqs.map((d) => (
                <li key={d.id}>• {d.label}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section>
        <h3 className="text-sm font-bold text-gray-900 mb-3">Combined scores</h3>
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm min-w-[360px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">
                  Assessment area
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 w-28">
                  Avg score (1–5)
                </th>
              </tr>
            </thead>
            <tbody>
              {guide.weights.map((row) => {
                const avg = scores.areaScores[row.area];
                return (
                  <tr key={row.area} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-gray-800">{row.area}</td>
                    <td className="px-4 py-3 text-center font-medium">
                      {avg?.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td className="px-4 py-3">
                  Total weighted score
                  <span className="block text-xs font-normal text-gray-500 mt-0.5">
                    (1 = Unsatisfactory … 5 = Excellent)
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-red-700 text-base">
                  {total?.toFixed(2) ?? "—"} / 5.00
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <span
            className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${standingClass}`}
          >
            Standing: {standingLabel(standing)}
          </span>
          <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
            {guide.interpretation}
          </p>
        </div>

        <details className="mt-3 text-xs text-gray-500">
          <summary className="cursor-pointer font-medium text-gray-600">
            Rating scale reference
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n}>
                {n} — {ratingLabelForGuide(guide, n)}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            AI analysis & recommendation
          </p>
          {!readOnly && onGenerateAnalysis && (
            <button
              type="button"
              onClick={onGenerateAnalysis}
              disabled={isGeneratingAnalysis}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-900 disabled:opacity-60"
            >
              {isGeneratingAnalysis && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {formData.summary?.ai_analysis ? "Regenerate" : "Generate"}
            </button>
          )}
        </div>

        {formData.summary?.ai_analysis ? (
          <>
            <p className="text-sm text-purple-950 leading-relaxed">
              {formData.summary.ai_analysis}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                  RECOMMENDATION_CLASSES[formData.summary.ai_recommendation ?? "hold"]
                }`}
              >
                AI recommends: {RECOMMENDATION_LABELS[formData.summary.ai_recommendation ?? "hold"]}
              </span>
              {formData.summary.ai_generated_at && (
                <span className="text-xs text-purple-500">
                  Generated {new Date(formData.summary.ai_generated_at).toLocaleString("en-GB")}
                </span>
              )}
            </div>
            <p className="text-xs text-purple-500">
              Advisory only — HR confirms the actual outcome from the application view.
            </p>
          </>
        ) : (
          <p className="text-xs text-purple-700">
            Get a quick AI read of the full Stage 1 + Stage 2 record before deciding.
          </p>
        )}
      </div>

      <section>
        <h3 className="text-sm font-bold text-gray-900 mb-1">
          Critical concerns checklist
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Note anything observed during the interview. These are for HR review — they do not automatically reject the candidate.
        </p>
        <div className="space-y-2">
          {disqualifierRows.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 border border-gray-200 bg-gray-50 rounded-lg p-3"
            >
              <p className="text-sm text-gray-800 flex-1">{item.label}</p>
              <div className="flex gap-1">
                {(["yes", "no", ""] as const).map((v) => (
                  <button
                    key={v || "blank"}
                    type="button"
                    disabled={readOnly}
                    onClick={() =>
                      updateDisqualifier(
                        item.id,
                        v,
                        formData.disqualifiers?.[item.id]?.notes ?? "",
                      )
                    }
                    className={`px-2 py-1 rounded text-xs font-medium border ${
                      formData.disqualifiers?.[item.id]?.observed === v
                        ? v === "yes"
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-gray-700 text-white border-gray-700"
                        : "bg-white border-gray-200"
                    } ${readOnly ? "opacity-60" : ""}`}
                  >
                    {v === "yes"
                      ? evaluationLabels.observed
                      : v === "no"
                        ? evaluationLabels.notObserved
                        : evaluationLabels.neutral}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {selected && (
        <GraderSubmissionModal
          guide={guide}
          graderLabel={selected.grader.label}
          graderRole={selected.grader.role}
          stage={selected.stage}
          submission={submissionForGrader(selected.grader, selected.stage)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
