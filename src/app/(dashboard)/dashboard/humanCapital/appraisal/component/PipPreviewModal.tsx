"use client";

import { X } from "lucide-react";
import Link from "next/link";
import {
  buildAppraisalEvidenceHref,
  findGapEvidenceColumn,
  parseAppraisalRef,
  PIP_APPRAISAL_REF_KEY,
} from "@/lib/appraisal/pipGapChain";
import type { PipFormResponses } from "@/lib/appraisal/pipInstances";
import { isPipSectionVisible, pipFieldLabel, type PipFormSchema } from "@/lib/appraisal/pipFormSchema";

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
}: {
  open: boolean;
  onClose: () => void;
  schema: PipFormSchema;
  responses: PipFormResponses;
  employeeName: string;
  status: string;
  canViewHrSections: boolean;
  appraisalId: string;
}) {
  if (!open) return null;

  const sections = schema.sections.filter((s) => isPipSectionVisible(s, canViewHrSections));
  const gapsSection = sections.find(
    (s) => s.kind === "table" && findGapEvidenceColumn(s),
  );
  const gapEvidenceKey =
    gapsSection?.kind === "table" ? findGapEvidenceColumn(gapsSection)?.key : undefined;

  const statusLabel =
    status === "active" ? "Active" : status === "completed" ? "Completed" : "Draft";

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
              PIP preview
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
          {schema.intro && (
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
                          {String(responses.fields?.[field.key] ?? "") || "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200">
                          {section.columns.map((col) => (
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
                        {(responses.tables?.[section.key] ?? []).map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-b border-gray-100">
                            {section.columns.map((col) => {
                              const isGapEvidence =
                                gapsSection?.key === section.key &&
                                gapEvidenceKey === col.key;
                              const ref = isGapEvidence
                                ? parseAppraisalRef(row[PIP_APPRAISAL_REF_KEY])
                                : null;
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
                                    String(row[col.key] ?? "") || "—"
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
