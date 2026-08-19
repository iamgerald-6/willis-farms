"use client";

import { RATING_LABELS } from "@/lib/careers/interviewFormConfigs";

export function RatingRow({
  label,
  lookFor,
  value,
  notes,
  onChange,
}: {
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

export function StageInfoBanner({
  stage,
  title,
  duration,
  briefing,
  recommendedPanel,
  totalDuration,
}: {
  stage?: number;
  title: string;
  duration: string;
  briefing?: string;
  recommendedPanel?: string;
  totalDuration?: string;
}) {
  return (
    <section className="bg-amber-50 border border-amber-100 rounded-xl p-4 mt-10 text-sm text-amber-900 space-y-2">
      <div className="space-y-2">
        <p className="font-semibold leading-snug">
          {stage != null && stage > 0 ? `Stage ${stage} — ` : ""}
          {title}
        </p>
        <span className="inline-block text-xs font-medium bg-amber-100 text-amber-800 px-2.5 py-1.5 rounded-lg leading-normal whitespace-normal">
          {duration}
        </span>
      </div>
      {briefing && <p className="leading-relaxed">{briefing}</p>}
      {(recommendedPanel || totalDuration) && (
        <p className="text-xs text-amber-800/80">
          {recommendedPanel && <>Recommended panel: {recommendedPanel}</>}
          {recommendedPanel && totalDuration && " · "}
          {totalDuration && <>Total interview: {totalDuration}</>}
        </p>
      )}
    </section>
  );
}

export function StepIndicator<T extends string>({
  steps,
  current,
  labels,
}: {
  steps: T[];
  current: T;
  labels: string[];
}) {
  const currentIdx = steps.indexOf(current);

  return (
    <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = step === current;
        return (
          <div
            key={step}
            className="flex items-center gap-1 sm:gap-2 shrink-0"
          >
            <div
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
                active
                  ? "bg-red-600 text-white"
                  : done
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : "bg-gray-100 text-gray-500"
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                {done ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{labels[i]}</span>
            </div>
            {i < steps.length - 1 && (
              <span className="text-gray-300 hidden sm:inline">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
