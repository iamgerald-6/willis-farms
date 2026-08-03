"use client";

import {
  computeWeightedScore,
  RATING_LABELS,
} from "@/lib/careers/interviewFormConfigs";
import {
  PANEL_DECISIONS,
  type InterviewFormData,
  type PanelDecision,
} from "@/lib/careers/types";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { StageInfoBanner } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  scores: ReturnType<typeof computeWeightedScore>;
  onChange: (data: InterviewFormData) => void;
};

export default function Stage3Evaluation({
  guide,
  formData,
  scores,
  onChange,
}: Props) {
  const updateDisqualifier = (
    id: string,
    observed: "yes" | "no" | "",
    notes: string,
  ) => {
    onChange({
      ...formData,
      disqualifiers: {
        ...formData.disqualifiers,
        [id]: { observed, notes },
      },
    });
  };

  const total = scores.total;
  const interpretation = guide.interpretation;

  let standing = "Incomplete";
  let standingClass = "text-gray-600 bg-gray-100";
  if (total != null) {
    if (total >= 4.0) {
      standing = "Strong hire / appoint";
      standingClass = "text-green-800 bg-green-100";
    } else if (total >= 3.3) {
      standing = "Hire / appoint (confirm references)";
      standingClass = "text-blue-800 bg-blue-100";
    } else if (total >= 2.8) {
      standing = "Hold / reserve";
      standingClass = "text-amber-800 bg-amber-100";
    } else {
      standing = "Do not hire / appoint";
      standingClass = "text-red-800 bg-red-100";
    }
  }

  return (
    <div className="space-y-8">
      <StageInfoBanner
        stage={3}
        title="Evaluation summary (Section D)"
        duration={guide.stageDurations.stage3}
        totalDuration={guide.duration}
      />

      <section>
        <h3 className="text-sm font-bold text-gray-900 mb-3">
          Section D — Weighted evaluation sheet
        </h3>
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
            Standing: {standing}
          </span>
          <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
            {interpretation}
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
        <div className="flex flex-wrap gap-2">
          {PANEL_DECISIONS.map((d) => (
            <button
              key={d.value}
              type="button"
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
              }`}
            >
              {d.label}
            </button>
          ))}
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
          rows={3}
          placeholder="Decision rationale and conditions"
          className="w-full mt-3 border border-gray-200 rounded-lg px-3 py-2 text-sm"
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
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
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
                    }`}
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
