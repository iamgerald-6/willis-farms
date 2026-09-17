"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, FileText } from "lucide-react";
import {
  buildAppraisalEvidenceHref,
  type PipAppraisalSummary,
} from "@/lib/appraisal/pipGapChain";

export default function PipAppraisalReferencePanel({
  summary,
  appraisalId,
}: {
  summary: PipAppraisalSummary;
  appraisalId: string;
}) {
  const [open, setOpen] = useState(false);

  const periodLabel =
    summary.review_quarter === "Q4"
      ? `Annual ${summary.review_year}`
      : `${summary.review_quarter} ${summary.review_year}`;

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-gray-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Appraisal reference</p>
            <p className="text-xs text-gray-500 truncate">
              {periodLabel}
              {summary.final_quarter_score != null
                ? ` · ${summary.final_quarter_score.toFixed(1)}% (${summary.score_band})`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/dashboard/humanCapital/appraisal/${appraisalId}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Open appraisal
            <ExternalLink className="w-3 h-3" />
          </Link>
          {open ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
          {summary.improvement_areas && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                Improvement areas
              </p>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                {summary.improvement_areas}
              </p>
            </div>
          )}

          {summary.weak_items.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Review areas below target 4/5 (supervisor final)
              </p>
              <ul className="space-y-2">
                {summary.weak_items.map((item, i) => (
                  <li
                    key={`${item.sectionKey}-${item.item}-${i}`}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
                  >
                    <p className="font-semibold text-gray-800">
                      {item.sectionKey === "_narrative"
                        ? item.sectionTitle
                        : item.item}
                    </p>
                    {item.sectionKey !== "_narrative" && (
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        Section {item.sectionKey}
                      </p>
                    )}
                    {item.rating != null && (
                      <p className="text-gray-500 mt-1">{item.actualPerformance}</p>
                    )}
                    {item.sectionKey !== "_narrative" && (
                      <Link
                        href={buildAppraisalEvidenceHref(appraisalId, item.sectionKey, item.item)}
                        className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-red-600 hover:text-red-700"
                      >
                        View in appraisal
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
