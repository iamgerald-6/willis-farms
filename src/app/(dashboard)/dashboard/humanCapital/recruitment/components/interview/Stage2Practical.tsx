"use client";

import { Loader2 } from "lucide-react";
import type { InterviewFormData } from "@/lib/careers/types";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { RatingRow, StageInfoBanner } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  onChange: (data: InterviewFormData) => void;
  onSaveDraft: () => void;
  onComplete: () => void;
  isPending: boolean;
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
  formData,
  onChange,
  onSaveDraft,
  onComplete,
  isPending,
}: Props) {
  const updateScenario = (
    id: string,
    rating: number | null,
    notes: string,
  ) => {
    onChange({
      ...formData,
      scenario_ratings: {
        ...formData.scenario_ratings,
        [id]: { rating, notes },
      },
    });
  };

  const scheduledLabel = formatScheduled(formData.stage2_scheduled_at);

  return (
    <div className="space-y-8">
      <StageInfoBanner
        stage={2}
        title="Scenarios & practical assessment (Section C)"
        duration={guide.stageDurations.stage2}
        totalDuration={guide.duration}
      />

      {scheduledLabel && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          Practical scheduled: <strong>{scheduledLabel}</strong>
          {formData.setup?.location && (
            <> · {formData.setup.location}</>
          )}
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
              value={formData.scenario_ratings?.[s.id]?.rating ?? null}
              notes={formData.scenario_ratings?.[s.id]?.notes ?? ""}
              onChange={(rating, notes) => updateScenario(s.id, rating, notes)}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={isPending}
          className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
        >
          Save Stage 2 draft
        </button>
        <button
          type="button"
          onClick={onComplete}
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Complete Stage 2 → Evaluation
        </button>
      </div>
    </div>
  );
}
