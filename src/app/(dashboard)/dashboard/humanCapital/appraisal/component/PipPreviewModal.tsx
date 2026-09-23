"use client";

import { X } from "lucide-react";
import Link from "next/link";
import {
  buildAppraisalEvidenceHref,
  detectPipSectionRole,
  findGapChainSections,
  findGapEvidenceColumn,
  getGapOptions,
  parseAppraisalRef,
  PIP_APPRAISAL_REF_KEY,
  PIP_GAP_ID_KEY,
} from "@/lib/appraisal/pipGapChain";
import type { PipFormResponses } from "@/lib/appraisal/pipInstances";
import {
  getGapFieldValue,
  isFinalOutcomeTableRole,
} from "@/lib/appraisal/pipFinalOutcome";
import { getFinalOutcomeGapOptions } from "@/lib/appraisal/pipGapLock";
import {
  findReviewDateColumn,
  formatRatingDisplay,
  getCoachingProgressRatingForDate,
  getGapBaselineRating,
  isBaselineRatingColumn,
  isReviewProgressRatingColumn,
} from "@/lib/appraisal/pipProgressReview";
import { isPipSectionVisible, pipFieldLabel, type PipFormSchema } from "@/lib/appraisal/pipFormSchema";
import {
  ensureReviewsSectionColumns,
  isCoachingSection,
  isStage1Section,
  isStage2Section,
  isStage3Section,
} from "@/lib/appraisal/pipStages";

const NAVY = "#1e3a5f";

export default function PipPreviewModal({
  open,
  onClose,
  schema,
  responses,
  employeeName,
  status,
  canViewHrSections,
  appraisalId,
  previewStage = "plan",
}: {
  open: boolean;
  onClose: () => void;
  schema: PipFormSchema;
  responses: PipFormResponses;
  employeeName: string;
  status: string;
  canViewHrSections: boolean;
  appraisalId: string;
  /** Limit preview to the current workflow stage. */
  previewStage?: "plan" | "tracking" | "finalOutcome";
}) {
  if (!open) return null;

  const sections = schema.sections.filter((s) => {
    if (!isPipSectionVisible(s, canViewHrSections)) return false;
    if (previewStage === "plan") return isStage1Section(s);
    if (previewStage === "tracking") return isStage2Section(s);
    return isStage3Section(s);
  });
  const gapsSection = sections.find(
    (s) => s.kind === "table" && findGapEvidenceColumn(s),
  );
  const gapEvidenceKey =
    gapsSection?.kind === "table" ? findGapEvidenceColumn(gapsSection)?.key : undefined;

  const gapChain = findGapChainSections(schema);
  const coachingSection = schema.sections.find(
    (s) => s.kind === "table" && isCoachingSection(s),
  );
  const trackingGapId =
    responses.meta?.selected_coaching_gap_id?.trim() ||
    (gapChain.gaps ? getGapOptions(responses.tables ?? {}, gapChain.gaps)[0]?.id : "") ||
    "";

  const finalOutcomeGapId =
    responses.meta?.selected_final_outcome_gap_id?.trim() ||
    getFinalOutcomeGapOptions(schema, responses)[0]?.id ||
    "";

  const previewGapId =
    previewStage === "finalOutcome" ? finalOutcomeGapId : trackingGapId;

  const statusLabel =
    status === "active" ? "Active" : status === "completed" ? "Completed" : "Draft";
  const stageLabel =
    previewStage === "plan"
      ? "Plan"
      : previewStage === "tracking"
        ? "Tracking"
        : "Final outcome";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-gray-50 w-full max-w-4xl rounded-2xl shadow-xl my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-t-2xl px-5 py-4 flex items-start justify-between gap-3 text-white"
          style={{ backgroundColor: NAVY }}
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
              PIP preview — {stageLabel}
            </p>
            <h2 className="text-lg font-bold">{schema.title ?? "Performance Improvement Plan"}</h2>
            <p className="text-sm text-white/70 mt-0.5">{employeeName}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/15">
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {previewStage === "plan" && schema.intro && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{schema.intro}</p>
          )}

          {sections.map((section, index) => (
            <div key={section.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900">
                  {index + 1}. {section.title}
                </h3>
              </div>
              <div className="p-4">
                {section.kind === "fields" ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    {section.fields.map((field) => (
                      <div key={field.key}>
                        <dt className="text-xs font-medium text-gray-500">{pipFieldLabel(field)}</dt>
                        <dd className="text-sm text-gray-900 mt-0.5 break-words">
                          {previewStage === "finalOutcome" && finalOutcomeGapId
                            ? getGapFieldValue(
                                responses.fields,
                                field.key,
                                finalOutcomeGapId,
                              ) || "—"
                            : String(responses.fields?.[field.key] ?? "") || "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  (() => {
                    const sectionRole = detectPipSectionRole(section);
                    const isReviewsSection = sectionRole === "reviews";
                    const isFinalOutcomeTable = isFinalOutcomeTableRole(sectionRole);
                    const gapScoped = isReviewsSection || isFinalOutcomeTable;
                    const displaySection = isReviewsSection
                      ? ensureReviewsSectionColumns(section)
                      : section;
                    const reviewDateCol = isReviewsSection
                      ? findReviewDateColumn(displaySection)
                      : undefined;
                    const tableRows = (responses.tables?.[section.key] ?? []).filter((row) => {
                      if (!gapScoped || !previewGapId) return true;
                      return String(row[PIP_GAP_ID_KEY] ?? "") === previewGapId;
                    });

                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px] text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-gray-200">
                              {displaySection.columns.map((col) => (
                                <th
                                  key={col.key}
                                  className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-2 py-2"
                                >
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tableRows.map((row, rowIndex) => (
                              <tr key={rowIndex} className="border-b border-gray-100">
                                {displaySection.columns.map((col) => {
                                  const isGapEvidence =
                                    gapsSection?.key === section.key &&
                                    gapEvidenceKey === col.key;
                                  const ref = isGapEvidence
                                    ? parseAppraisalRef(row[PIP_APPRAISAL_REF_KEY])
                                    : null;
                                  const gapIdForRow =
                                    previewGapId ||
                                    String(row[PIP_GAP_ID_KEY] ?? "").trim();

                                  let cellValue = String(row[col.key] ?? "") || "—";

                                  if (
                                    isReviewsSection &&
                                    isBaselineRatingColumn(col) &&
                                    gapIdForRow &&
                                    gapChain.gaps
                                  ) {
                                    cellValue = formatRatingDisplay(
                                      getGapBaselineRating(
                                        gapIdForRow,
                                        responses.tables ?? {},
                                        gapChain.gaps,
                                      ),
                                    );
                                  } else if (
                                    isReviewsSection &&
                                    isReviewProgressRatingColumn(col) &&
                                    gapIdForRow &&
                                    coachingSection?.kind === "table"
                                  ) {
                                    const sessionDate = reviewDateCol
                                      ? String(row[reviewDateCol.key] ?? "")
                                      : "";
                                    cellValue = formatRatingDisplay(
                                      getCoachingProgressRatingForDate(
                                        gapIdForRow,
                                        sessionDate,
                                        responses.tables ?? {},
                                        coachingSection,
                                      ),
                                    );
                                  }

                                  return (
                                    <td key={col.key} className="px-2 py-2 align-top text-gray-800">
                                      {isGapEvidence && ref && ref.sectionKey !== "_narrative" ? (
                                        <Link
                                          href={buildAppraisalEvidenceHref(
                                            ref.appraisalId ?? appraisalId,
                                            ref.sectionKey,
                                            ref.item,
                                          )}
                                          className="text-xs font-semibold text-red-600 hover:text-red-700"
                                        >
                                          View in appraisal
                                        </Link>
                                      ) : (
                                        cellValue
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-b-2xl border-t border-gray-200 px-5 py-3 flex justify-end bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
