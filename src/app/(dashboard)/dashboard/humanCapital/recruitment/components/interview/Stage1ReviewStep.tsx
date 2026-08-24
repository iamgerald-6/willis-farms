"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { InterviewFormData, StageSubmissionData } from "@/lib/careers/types";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import {
  gradersForStage,
  getSubmission,
  stageAverage,
  stage1ReadyForReview,
  type GraderResult,
} from "@/lib/careers/panelInterview";
import { scoreStanding, standingLabel } from "@/lib/careers/panelDecision";
import { StageInfoBanner } from "./shared";
import GraderSubmissionModal from "./GraderSubmissionModal";

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  onPass: () => void;
  onReject: () => void;
  isPending: boolean;
  readOnly?: boolean;
  onGenerateAnalysis?: () => void;
  isGeneratingAnalysis?: boolean;
};

export default function Stage1ReviewStep({
  guide,
  formData,
  onPass,
  onReject,
  isPending,
  readOnly = false,
  onGenerateAnalysis,
  isGeneratingAnalysis = false,
}: Props) {
  const graders = gradersForStage(formData, guide, 1);
  const average = stageAverage(formData, guide, 1);
  const standing = scoreStanding(average);
  const ready = stage1ReadyForReview(formData);
  const reviewed = formData.stage1_review?.reviewed_at;
  const passed = formData.stage1_review?.passed;
  const [selectedGrader, setSelectedGrader] = useState<GraderResult | null>(null);

  const submissionForGrader = (g: GraderResult): StageSubmissionData | undefined =>
    g.role === "hr" ? formData.hr_submission?.stage1 : getSubmission(formData, g.id, 1);

  return (
    <div className="space-y-6">
      <StageInfoBanner
        title="Stage 1 — Panel grading review"
        duration="Before Stage 2"
        briefing="Review all Stage 1 scores from panel members and HR. The candidate proceeds based on the average — one low score alone does not automatically fail them."
      />

      {!ready && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          Waiting for all Stage 1 submissions. Each panel member and HR must submit before review.
        </p>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Grader</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Score</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {graders.map((g) => (
              <tr
                key={g.id}
                onClick={() => g.submitted_at && setSelectedGrader(g)}
                className={`border-b border-gray-100 ${
                  g.submitted_at ? "cursor-pointer hover:bg-gray-50" : ""
                }`}
                title={g.submitted_at ? "View filled form" : undefined}
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  {g.submitted_at ? (
                    <span className="text-red-700 hover:underline">{g.label}</span>
                  ) : (
                    g.label
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 capitalize">{g.role}</td>
                <td className="px-4 py-3 text-center font-medium">
                  {g.total?.toFixed(2) ?? "—"}
                </td>
                <td className="px-4 py-3 text-center text-xs">
                  {g.submitted_at ? (
                    <span className="text-green-700">Submitted</span>
                  ) : (
                    <span className="text-gray-400">Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-bold">
              <td className="px-4 py-3" colSpan={2}>
                Average (all graders)
              </td>
              <td className="px-4 py-3 text-center text-red-700">
                {average?.toFixed(2) ?? "—"} / 5.00
              </td>
              <td className="px-4 py-3 text-center text-xs font-normal text-gray-500">
                {standingLabel(standing)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            AI analysis & recommendation
          </p>
          {!readOnly && ready && onGenerateAnalysis && (
            <button
              type="button"
              onClick={onGenerateAnalysis}
              disabled={isGeneratingAnalysis}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-900 disabled:opacity-60"
            >
              {isGeneratingAnalysis && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {formData.stage1_review?.ai_analysis ? "Regenerate" : "Generate"}
            </button>
          )}
        </div>

        {formData.stage1_review?.ai_analysis ? (
          <>
            <p className="text-sm text-purple-950 leading-relaxed">
              {formData.stage1_review.ai_analysis}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                  formData.stage1_review.ai_recommendation === "reject"
                    ? "bg-red-100 text-red-800"
                    : "bg-green-100 text-green-800"
                }`}
              >
                AI recommends:{" "}
                {formData.stage1_review.ai_recommendation === "reject"
                  ? "Reject"
                  : "Advance to Stage 2"}
              </span>
              {formData.stage1_review.ai_generated_at && (
                <span className="text-xs text-purple-500">
                  Generated {new Date(formData.stage1_review.ai_generated_at).toLocaleString("en-GB")}
                </span>
              )}
            </div>
            <p className="text-xs text-purple-500">
              Advisory only — the panel and HR make the final call.
            </p>
          </>
        ) : !ready ? (
          <p className="text-xs text-purple-700">
            Available once every panel member and HR have submitted.
          </p>
        ) : (
          <p className="text-xs text-purple-700">
            Get a quick AI read of everyone&apos;s scores and notes before deciding.
          </p>
        )}
      </div>

      {reviewed && (
        <p
          className={`text-sm rounded-xl px-4 py-3 border ${
            passed
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          Reviewed {new Date(reviewed).toLocaleString("en-GB")} —{" "}
          {passed ? "Passed to Stage 2 setup" : "Did not proceed to Stage 2"}
          {formData.stage1_review?.notes && (
            <> · {formData.stage1_review.notes}</>
          )}
        </p>
      )}

      {!readOnly && ready && !reviewed && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={isPending}
            className="flex-1 py-2.5 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-60"
          >
            Reject candidate
          </button>
          <button
            type="button"
            onClick={onPass}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Pass to Stage 2 setup
          </button>
        </div>
      )}

      {selectedGrader && (
        <GraderSubmissionModal
          guide={guide}
          graderLabel={selectedGrader.label}
          graderRole={selectedGrader.role}
          stage={1}
          submission={submissionForGrader(selectedGrader)}
          onClose={() => setSelectedGrader(null)}
        />
      )}
    </div>
  );
}
