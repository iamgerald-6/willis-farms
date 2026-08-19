"use client";

import { Loader2 } from "lucide-react";
import type { StageSubmissionData } from "@/lib/careers/types";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { RatingRow, StageInfoBanner } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  submission: StageSubmissionData;
  onChange: (data: StageSubmissionData) => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  isPending: boolean;
  submitted?: boolean;
};

export default function Stage1ScreeningQuestions({
  guide,
  submission,
  onChange,
  onSaveDraft,
  onSubmit,
  isPending,
  submitted = false,
}: Props) {
  const updateScreening = (
    id: string,
    pass: "yes" | "no" | "",
    notes: string,
  ) => {
    onChange({
      ...submission,
      screening: {
        ...submission.screening,
        [id]: { pass, notes },
      },
    });
  };

  const updateQuestion = (id: string, rating: number | null, notes: string) => {
    onChange({
      ...submission,
      question_ratings: {
        ...submission.question_ratings,
        [id]: { rating, notes },
      },
    });
  };

  return (
    <div className="space-y-8">
      <StageInfoBanner
        stage={1}
        title="HR — Stage 1 screening & questions"
        duration={guide.stageDurations.stage1}
        totalDuration={guide.duration}
        briefing="Complete your Stage 1 evaluation. Panel members submit independently via their invite links."
      />

      {submitted && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          HR Stage 1 submitted{" "}
          {submission.submitted_at &&
            new Date(submission.submitted_at).toLocaleString("en-GB")}
          .
        </p>
      )}

      <section>
        <h3 className="text-sm font-bold text-gray-900 mb-3">Section A — Screening</h3>
        <div className="space-y-3">
          {guide.screening.map((item) => (
            <div key={item.id} className="border border-gray-100 rounded-xl p-4">
              <p className="text-sm text-gray-900">
                <span className="font-mono text-xs text-gray-400 mr-2">{item.id}</span>
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
                    disabled={submitted}
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
                        : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
                    } ${submitted ? "opacity-60" : ""}`}
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
              label={`${q.id} · ${q.section} — ${q.question}`}
              lookFor={q.lookFor}
              value={submission.question_ratings?.[q.id]?.rating ?? null}
              notes={submission.question_ratings?.[q.id]?.notes ?? ""}
              onChange={(rating, notes) => updateQuestion(q.id, rating, notes)}
              readOnly={submitted}
            />
          ))}
        </div>
      </section>

      {!submitted && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isPending}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit HR Stage 1
          </button>
        </div>
      )}
    </div>
  );
}
