"use client";

import {
  computeWeightedScore,
  RATING_LABELS,
} from "@/lib/careers/interviewFormConfigs";
import {
  canConfirmHire,
  observedDisqualifiers,
  scoreStanding,
  standingLabel,
} from "@/lib/careers/panelDecision";
import {
  PANEL_DECISIONS,
  type InterviewFormData,
  type PanelDecision,
} from "@/lib/careers/types";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { AlertTriangle } from "lucide-react";
import { StageInfoBanner } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  scores: ReturnType<typeof computeWeightedScore>;
  onChange: (data: InterviewFormData) => void;
  readOnly?: boolean;
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
  const hireAllowed = canConfirmHire(total);
  const observedDqs = observedDisqualifiers(formData, guide.disqualifiers);

  return (
    <div className="space-y-8">
      <StageInfoBanner
        stage={3}
        title="Evaluation summary (Section D)"
        duration={guide.stageDurations.stage3}
        totalDuration={guide.duration}
      />

      {observedDqs.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Disqualifier(s) marked as observed
            </p>
            <p className="text-xs text-amber-800 mt-1">
              HR may still confirm hire after review — this does not automatically block the decision.
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
        <h3 className="text-sm font-bold text-gray-900 mb-3">
          Section D — Weighted evaluation sheet
        </h3>
        {/* table unchanged */}
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">
                  Assessment area
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 w-24">
                  Weight
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 w-28">
                  Avg score (1–5)
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 w-28">
                  Weighted
                </th>
              </tr>
            </thead>
            <tbody>
              {guide.weights.map((row) => {
                const avg = scores.areaScores[row.area];
                const weighted =
                  avg != null
                    ? Math.round(avg * (row.weight / 100) * 100) / 100
                    : null;
                return (
                  <tr key={row.area} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-gray-800">{row.area}</td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {row.weight}%
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      {avg?.toFixed(2) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      {weighted?.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td className="px-4 py-3" colSpan={2}>
                  Total weighted score
                </td>
                <td className="px-4 py-3 text-center text-xs font-normal text-gray-500">
                  (1 = Unsatisfactory … 5 = Excellent)
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
            {Object.entries(RATING_LABELS).map(([n, label]) => (
              <li key={n}>
                {n} — {label}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section>
        <h3 className="text-sm font-bold text-gray-900 mb-3">Panel decision</h3>
        {!hireAllowed && total != null && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
            Hire requires a weighted score of at least 3.3. Hold or Do not hire are available for this score.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {PANEL_DECISIONS.map((d) => {
            const isHire = d.value === "hire";
            const disabled = readOnly || (isHire && !hireAllowed);
            return (
              <button
                key={d.value}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...formData,
                    summary: {
                      ...formData.summary,
                      decision: d.value as PanelDecision,
                    },
                  })
                }
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  formData.summary?.decision === d.value
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-gray-700 border-gray-200"
                } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={formData.summary?.decision_notes ?? ""}
          onChange={(e) =>
            onChange({
              ...formData,
              summary: {
                ...formData.summary,
                decision_notes: e.target.value,
              },
            })
          }
          readOnly={readOnly}
          rows={3}
          placeholder="Decision rationale and conditions"
          className="w-full mt-3 border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
        />
        <div className="mt-3">
          <label className="text-xs text-gray-500 block mb-1">
            Recommended start date (optional)
          </label>
          <input
            type="date"
            value={formData.summary?.recommended_start_date ?? ""}
            onChange={(e) =>
              onChange({
                ...formData,
                summary: {
                  ...formData.summary,
                  recommended_start_date: e.target.value,
                },
              })
            }
            readOnly={readOnly}
            disabled={readOnly}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
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
                    disabled={readOnly}
                    onClick={() =>
                      updateDisqualifier(
                        `dq_${i}`,
                        v,
                        formData.disqualifiers?.[`dq_${i}`]?.notes ?? "",
                      )
                    }
                    className={`px-2 py-1 rounded text-xs font-medium border ${
                      formData.disqualifiers?.[`dq_${i}`]?.observed === v
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white border-gray-200"
                    } ${readOnly ? "opacity-60" : ""}`}
                  >
                    {v === "yes" ? "Observed" : v === "no" ? "No" : "—"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
