"use client";

import { Loader2 } from "lucide-react";
import type { StageSubmissionData } from "@/lib/careers/types";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { RatingRow, StageInfoBanner } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  submission: StageSubmissionData;
  scheduledAt?: string;
  location?: string;
  onChange: (data: StageSubmissionData) => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  isPending: boolean;
  submitted?: boolean;
};

function formatScheduled(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Stage2Practical({
  guide,
  submission,
  scheduledAt,
  location,
  onChange,
  onSaveDraft,
  onSubmit,
  isPending,
  submitted = false,
}: Props) {
  const updateScenario = (
    id: string,
    rating: number | null,
    notes: string,
  ) => {
    onChange({
      ...submission,
      scenario_ratings: {
        ...submission.scenario_ratings,
        [id]: { rating, notes },
      },
    });
  };

  const scheduledLabel = formatScheduled(scheduledAt);

  return (
    <div className="space-y-8">
      <StageInfoBanner
        stage={2}
        title="HR — Stage 2 practical assessment"
        duration={guide.stageDurations.stage2}
        totalDuration={guide.duration}
        briefing="Complete your Stage 2 practical evaluation. Panel members submit via their Stage 2 invite links."
      />

      {scheduledLabel && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          Practical scheduled: <strong>{scheduledLabel}</strong>
          {location && <> · {location}</>}
        </p>
      )}

      {submitted && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          HR Stage 2 submitted{" "}
          {submission.submitted_at &&
            new Date(submission.submitted_at).toLocaleString("en-GB")}
          .
        </p>
      )}

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
              onChange={(rating, notes) => updateScenario(s.id, rating, notes)}
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
            Submit HR Stage 2 → Evaluation
          </button>
        </div>
      )}
    </div>
  );
}
