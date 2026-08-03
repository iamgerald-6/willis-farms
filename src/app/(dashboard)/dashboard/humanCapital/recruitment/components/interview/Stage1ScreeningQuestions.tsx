"use client";

import { useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import type { InterviewFormData } from "@/lib/careers/types";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { RatingRow, StageInfoBanner } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  onChange: (data: InterviewFormData) => void;
  onSaveDraft: () => void;
  onScheduleStage2: (scheduledAt: string) => void;
  isPending: boolean;
};

function toLocalDatetime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Stage1ScreeningQuestions({
  guide,
  formData,
  onChange,
  onSaveDraft,
  onScheduleStage2,
  isPending,
}: Props) {
  const [scheduleInput, setScheduleInput] = useState(
    formData.stage2_scheduled_at ?? "",
  );

  const updateScreening = (
    id: string,
    pass: "yes" | "no" | "",
    notes: string,
  ) => {
    onChange({
      ...formData,
      screening: {
        ...formData.screening,
        [id]: { pass, notes },
      },
    });
  };

  const updateQuestion = (id: string, rating: number | null, notes: string) => {
    onChange({
      ...formData,
      question_ratings: {
        ...formData.question_ratings,
        [id]: { rating, notes },
      },
    });
  };

  return (
    <div className="space-y-8">
      <StageInfoBanner
        stage={1}
        title="Screening & structured questions (Sections A & B)"
        duration={guide.stageDurations.stage1}
        totalDuration={guide.duration}
      />

      <section>
        <h3 className="text-sm font-bold text-gray-900 mb-3">
          Section A — Screening
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
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
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
              label={`${q.id} · ${q.section} — ${q.question}`}
              lookFor={q.lookFor}
              value={formData.question_ratings?.[q.id]?.rating ?? null}
              notes={formData.question_ratings?.[q.id]?.notes ?? ""}
              onChange={(rating, notes) => updateQuestion(q.id, rating, notes)}
            />
          ))}
        </div>
      </section>

      <section className="border-t border-gray-100 pt-6">
        <h3 className="text-sm font-bold text-gray-900 mb-2">
          Schedule Stage 2 — Practical assessment
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Set the practical date and time. An email is sent to the candidate and{" "}
          <strong>info@willsfarms.com</strong> ({guide.stageDurations.stage2}).
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="datetime-local"
            value={toLocalDatetime(scheduleInput)}
            onChange={(e) =>
              setScheduleInput(
                e.target.value ? new Date(e.target.value).toISOString() : "",
              )
            }
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => scheduleInput && onScheduleStage2(scheduleInput)}
            disabled={isPending || !scheduleInput}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Calendar className="w-4 h-4" />
            )}
            Schedule & continue to Stage 2
          </button>
        </div>
        {formData.stage2_schedule_sent_at && (
          <p className="text-xs text-green-700 mt-2">
            Schedule email sent{" "}
            {new Date(formData.stage2_schedule_sent_at).toLocaleString("en-GB")}
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={onSaveDraft}
        disabled={isPending}
        className="w-full py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
      >
        Save Stage 1 draft
      </button>
    </div>
  );
}
