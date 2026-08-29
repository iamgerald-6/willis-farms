"use client";

import { X } from "lucide-react";
import type { StageSubmissionData } from "@/lib/careers/types";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { RatingRow } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  graderLabel: string;
  graderRole: "panel" | "hr";
  stage: 1 | 2;
  submission: StageSubmissionData | undefined;
  onClose: () => void;
};

/** Read-only popup showing one grader's full filled-in form — same modal
 * style as the "Needs attention" View more list (centered card, backdrop
 * blur, header with title + close). Opened by clicking a grader's row on
 * the Stage 1 review table. */
export default function GraderSubmissionModal({
  guide,
  graderLabel,
  graderRole,
  stage,
  submission,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{graderLabel}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {graderRole === "hr" ? "HR" : "Panel member"} · Stage {stage}
              {submission?.submitted_at && (
                <> · Submitted {new Date(submission.submitted_at).toLocaleString("en-GB")}</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto min-h-0 space-y-6">
          {!submission?.submitted_at ? (
            <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-4">
              No submission yet.
            </p>
          ) : stage === 1 ? (
            <>
              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-3">Section A — Screening</h3>
                <div className="space-y-3">
                  {guide.screening.map((item) => {
                    const answer = submission.screening?.[item.id];
                    return (
                      <div key={item.id} className="border border-gray-100 rounded-xl p-4">
                        <p className="text-sm text-gray-900">
                          <span className="font-mono text-xs text-gray-400 mr-2">{item.id}</span>
                          {item.requirement}
                          {item.mandatory && <span className="text-red-500 text-xs ml-1">*</span>}
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <span
                            className={`px-3 py-1 rounded-lg text-xs font-medium border ${
                              answer?.pass === "yes"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : answer?.pass === "no"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : "bg-gray-50 text-gray-400 border-gray-200"
                            }`}
                          >
                            {answer?.pass === "yes" ? "Yes" : answer?.pass === "no" ? "No" : "Not answered"}
                          </span>
                          {answer?.notes && (
                            <span className="text-xs text-gray-500">{answer.notes}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                      label={`${q.id} · ${q.section} — ${q.question}`}
                      lookFor={q.lookFor}
                      value={submission.question_ratings?.[q.id]?.rating ?? null}
                      notes={submission.question_ratings?.[q.id]?.notes ?? ""}
                      onChange={() => {}}
                      readOnly
                    />
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section>
              <h3 className="text-sm font-bold text-gray-900 mb-3">
                Section C — Scenarios / practical
              </h3>
              <div className="space-y-4">
                {guide.scenarios.map((s) => (
                  <RatingRow
                    key={s.id}
                    label={`${s.id} — ${s.title}`}
                    lookFor={s.observe}
                    value={submission.scenario_ratings?.[s.id]?.rating ?? null}
                    notes={submission.scenario_ratings?.[s.id]?.notes ?? ""}
                    onChange={() => {}}
                    readOnly
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
