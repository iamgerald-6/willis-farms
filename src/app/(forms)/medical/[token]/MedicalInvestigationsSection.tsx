"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import type { MedicalFormResponses } from "@/lib/medical/medicalFormSchema";
import {
  NORMAL_ABNORMAL,
  PANEL_FLAG,
  type InvestigationDef,
  type InvestigationEntry,
  type InvestigationsData,
  type OtherInvestigationEntry,
  emptyInvestigationsData,
} from "@/lib/medical/medicalInvestigationDefs";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import { ACCEPT_PDF_WORD_OR_IMAGE } from "@/lib/uploadConstraints";

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";
const prefilledClass =
  "w-full border border-amber-300 bg-amber-50/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40";

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="block text-xs font-medium text-gray-700 mb-1">
      {label}
      {required ? <span className="text-red-600 ml-0.5">*</span> : null}
    </span>
  );
}

function inputCls(prefilled?: boolean, readOnly?: boolean) {
  if (readOnly) return `${inputClass} bg-gray-50`;
  return prefilled ? prefilledClass : inputClass;
}

function newOtherEntryId(): string {
  return `other_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function MedicalInvestigationsSection({
  token,
  responses,
  onChange,
  readOnly,
  defs,
}: {
  token: string;
  responses: MedicalFormResponses;
  onChange: (next: MedicalFormResponses) => void;
  readOnly?: boolean;
  defs: InvestigationDef[];
}) {
  const data: InvestigationsData = responses.investigations ?? emptyInvestigationsData();
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);

  const updateInvestigations = (next: InvestigationsData) => {
    onChange({ ...responses, investigations: next });
  };

  const updateTest = (testId: string, patch: Partial<InvestigationEntry>) => {
    const prev = data.tests[testId] ?? {};
    updateInvestigations({
      ...data,
      tests: {
        ...data.tests,
        [testId]: { ...prev, ...patch, prefilled: patch.prefilled ?? false },
      },
    });
  };

  const updatePanelParam = (
    testId: string,
    paramKey: string,
    patch: { value?: string; unit?: string; reference_range?: string; flag?: string },
  ) => {
    const prev = data.tests[testId] ?? {};
    updateInvestigations({
      ...data,
      tests: {
        ...data.tests,
        [testId]: {
          ...prev,
          prefilled: false,
          parameters: {
            ...(prev.parameters ?? {}),
            [paramKey]: { ...(prev.parameters?.[paramKey] ?? {}), ...patch },
          },
        },
      },
    });
  };

  const otherEntries = data.other ?? [];

  const addOtherEntry = () => {
    updateInvestigations({
      ...data,
      other: [...otherEntries, { id: newOtherEntryId(), name: "" }],
    });
  };

  const updateOtherEntry = (id: string, patch: Partial<OtherInvestigationEntry>) => {
    updateInvestigations({
      ...data,
      other: otherEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  };

  const removeOtherEntry = (id: string) => {
    updateInvestigations({ ...data, other: otherEntries.filter((e) => e.id !== id) });
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setExtractNote(null);
    try {
      const uploaded = await uploadCareersFile(
        file,
        "MedicalExamLabReport",
        ACCEPT_PDF_WORD_OR_IMAGE,
        "lab_report",
      );
      const reports = [...(data.lab_reports ?? []), {
        secure_url: uploaded.secure_url,
        public_id: uploaded.public_id,
        original_name: uploaded.original_name || file.name,
        uploaded_at: new Date().toISOString(),
      }];
      updateInvestigations({ ...data, lab_reports: reports });

      setExtracting(true);
      const res = await fetch(`/api/medical/${token}/extract-lab-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: uploaded.secure_url,
          file_name: uploaded.original_name || file.name,
          current_investigations: data,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read the laboratory report.");

      const merged = json.data?.investigations as InvestigationsData | undefined;
      const count = json.data?.prefilled_count ?? 0;
      if (merged) {
        onChange({ ...responses, investigations: merged });
        setExtractNote(
          count > 0
            ? `${count} result${count === 1 ? "" : "s"} prefilled — please review and confirm each value.`
            : "Report attached — no matching results could be read automatically. Enter results manually.",
        );
      }
    } catch (e) {
      setExtractNote(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  const removeReport = (index: number) => {
    const reports = [...(data.lab_reports ?? [])];
    reports.splice(index, 1);
    updateInvestigations({ ...data, lab_reports: reports });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/40 p-4">
        <p className="text-sm font-semibold text-gray-900">Upload lab / medical reports</p>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          If a laboratory report is available (PDF or image), upload it here to prefill matching
          investigation results below. Review every prefilled value before submission. The original
          report stays attached to this examination and is never altered.
        </p>

        {(data.lab_reports ?? []).map((report, i) => (
          <div
            key={report.secure_url}
            className="mt-3 flex items-center justify-between gap-2 border border-white bg-white rounded-lg px-3 py-2"
          >
            <a
              href={report.secure_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-teal-800 truncate hover:underline"
            >
              {report.original_name ?? "Lab report"}
            </a>
            {!readOnly && (
              <button type="button" onClick={() => removeReport(i)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}

        {!readOnly && (
          <label className="mt-3 flex items-center gap-3 cursor-pointer border border-dashed border-teal-300 rounded-lg bg-white px-4 py-3 hover:border-teal-500">
            {uploading || extracting ? (
              <Loader2 className="w-5 h-5 animate-spin text-teal-700" />
            ) : (
              <Upload className="w-5 h-5 text-teal-600" />
            )}
            <span className="text-sm text-gray-700">
              {extracting
                ? "Reading report…"
                : uploading
                  ? "Uploading…"
                  : "Upload laboratory report (PDF or image)"}
            </span>
            <input
              type="file"
              className="sr-only"
              accept={ACCEPT_PDF_WORD_OR_IMAGE}
              disabled={uploading || extracting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.target.value = "";
              }}
            />
          </label>
        )}

        {extractNote && (
          <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {extractNote}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {defs.map((def) => {
          const entry = data.tests[def.id] ?? {};
          const prefilled = entry.prefilled === true;

          if (def.kind === "select") {
            return (
              <div key={def.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                <FieldLabel label={def.label} />
                <select
                  className={`${inputCls(prefilled, readOnly)} mt-1 max-w-md`}
                  value={entry.value ?? ""}
                  disabled={readOnly}
                  onChange={(e) => updateTest(def.id, { value: e.target.value, prefilled: false })}
                >
                  <option value="">Select…</option>
                  {def.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (def.kind === "text") {
            return (
              <div key={def.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                <FieldLabel label={def.label} />
                <input
                  className={`${inputCls(prefilled, readOnly)} max-w-md`}
                  value={entry.value ?? ""}
                  readOnly={readOnly}
                  placeholder={def.placeholder}
                  onChange={(e) => updateTest(def.id, { value: e.target.value, prefilled: false })}
                />
                {def.allowComment && (
                  <div className="mt-2 max-w-md">
                    <FieldLabel label="Comment (optional)" />
                    <input
                      className={inputCls(prefilled && !!entry.comment, readOnly)}
                      value={entry.comment ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => updateTest(def.id, { comment: e.target.value, prefilled: false })}
                    />
                  </div>
                )}
              </div>
            );
          }

          if (def.kind === "findings_flag") {
            return (
              <div key={def.id} className="rounded-lg border border-gray-100 bg-gray-50/50 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-900">{def.label}</p>
                <div>
                  <FieldLabel label="Findings / report" />
                  <textarea
                    className={`${inputCls(prefilled, readOnly)} min-h-[72px]`}
                    value={entry.findings ?? ""}
                    readOnly={readOnly}
                    onChange={(e) => updateTest(def.id, { findings: e.target.value, prefilled: false })}
                  />
                </div>
                <div className="max-w-xs">
                  <FieldLabel label="Normal / Abnormal" />
                  <select
                    className={inputCls(prefilled, readOnly)}
                    value={entry.flag ?? ""}
                    disabled={readOnly}
                    onChange={(e) => updateTest(def.id, { flag: e.target.value, prefilled: false })}
                  >
                    <option value="">Select…</option>
                    {NORMAL_ABNORMAL.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          }

          // panel — lean View/Add Results table: Result, Unit, Reference range, Flag
          const expanded = entry.expanded === true;
          return (
            <div key={def.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left bg-gray-50 hover:bg-gray-100/80"
                onClick={() => updateTest(def.id, { expanded: !expanded, prefilled: false })}
              >
                <span className="text-sm font-semibold text-gray-900">{def.label}</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                  {expanded ? (
                    <>
                      Hide results <ChevronDown className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      View / add results <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </span>
              </button>
              {expanded && (
                <div className="p-4 space-y-3 border-t border-gray-100">
                  {prefilled && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                      Prefilled from uploaded report — confirm each value.
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                          <th className="py-2 pr-2 font-medium">Parameter</th>
                          <th className="py-2 pr-2 font-medium">Result</th>
                          <th className="py-2 pr-2 font-medium">Unit</th>
                          <th className="py-2 pr-2 font-medium">Reference range</th>
                          <th className="py-2 font-medium">Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {def.parameters.map((param) => {
                          const pv = entry.parameters?.[param.key] ?? {};
                          const rowPrefilled = prefilled && !!pv.value;
                          const unitValue = pv.unit ?? param.defaultUnit ?? "";
                          const refValue = pv.reference_range ?? param.defaultReferenceRange ?? "";
                          return (
                            <tr key={param.key} className="border-b border-gray-50">
                              <td className="py-2 pr-2 text-gray-700 align-top whitespace-nowrap">{param.label}</td>
                              <td className="py-2 pr-2 align-top min-w-[90px]">
                                <input
                                  className={inputCls(rowPrefilled, readOnly)}
                                  value={pv.value ?? ""}
                                  readOnly={readOnly}
                                  onChange={(e) =>
                                    updatePanelParam(def.id, param.key, { value: e.target.value })
                                  }
                                />
                              </td>
                              <td className="py-2 pr-2 align-top min-w-[70px]">
                                <input
                                  className={inputCls(rowPrefilled, readOnly)}
                                  value={unitValue}
                                  readOnly={readOnly}
                                  placeholder="e.g. g/dL"
                                  onChange={(e) =>
                                    updatePanelParam(def.id, param.key, { unit: e.target.value })
                                  }
                                />
                              </td>
                              <td className="py-2 pr-2 align-top min-w-[100px]">
                                <input
                                  className={inputCls(rowPrefilled, readOnly)}
                                  value={refValue}
                                  readOnly={readOnly}
                                  placeholder="From lab report"
                                  onChange={(e) =>
                                    updatePanelParam(def.id, param.key, { reference_range: e.target.value })
                                  }
                                />
                              </td>
                              <td className="py-2 align-top min-w-[90px]">
                                <select
                                  className={inputCls(rowPrefilled, readOnly)}
                                  value={pv.flag ?? ""}
                                  disabled={readOnly}
                                  onChange={(e) =>
                                    updatePanelParam(def.id, param.key, { flag: e.target.value })
                                  }
                                >
                                  <option value="">—</option>
                                  {PANEL_FLAG.map((f) => (
                                    <option key={f} value={f}>
                                      {f}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Other investigation — anything not covered above, kept simple */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Other investigation</span>
            {!readOnly && (
              <button
                type="button"
                onClick={addOtherEntry}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800"
              >
                <Plus className="w-3.5 h-3.5" /> Add investigation
              </button>
            )}
          </div>
          {otherEntries.length > 0 && (
            <div className="p-4 space-y-3 border-t border-gray-100">
              {otherEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid sm:grid-cols-[1.3fr_1fr_0.7fr_1fr_0.8fr_auto] gap-2 items-end border-b border-gray-50 pb-3 last:border-b-0 last:pb-0"
                >
                  <div>
                    <FieldLabel label="Investigation name" />
                    <input
                      className={inputClass}
                      value={entry.name}
                      readOnly={readOnly}
                      onChange={(e) => updateOtherEntry(entry.id, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Result / findings" />
                    <input
                      className={inputClass}
                      value={entry.result ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => updateOtherEntry(entry.id, { result: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Unit" />
                    <input
                      className={inputClass}
                      value={entry.unit ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => updateOtherEntry(entry.id, { unit: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Reference range" />
                    <input
                      className={inputClass}
                      value={entry.reference_range ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => updateOtherEntry(entry.id, { reference_range: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Flag" />
                    <select
                      className={inputClass}
                      value={entry.flag ?? ""}
                      disabled={readOnly}
                      onChange={(e) => updateOtherEntry(entry.id, { flag: e.target.value })}
                    >
                      <option value="">—</option>
                      {PANEL_FLAG.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeOtherEntry(entry.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg justify-self-start"
                      aria-label="Remove investigation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
