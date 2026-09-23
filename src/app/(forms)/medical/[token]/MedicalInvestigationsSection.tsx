"use client";

import { Plus, Trash2 } from "lucide-react";
import type { MedicalFormResponses } from "@/lib/medical/medicalFormSchema";
import {
  INVESTIGATION_RESULT_SUMMARY_PLACEHOLDER,
  NORMAL_ABNORMAL,
  type InvestigationDef,
  type InvestigationEntry,
  type InvestigationsData,
  type MedicalAttachment,
  type OtherInvestigationEntry,
  emptyInvestigationsData,
} from "@/lib/medical/medicalInvestigationDefs";
import MedicalExamAttachmentsUpload from "./MedicalExamAttachmentsUpload";

const inputClass =
  "w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

function newOtherEntryId(): string {
  return `other_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function FlagSelect({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      className={`${inputClass} ${readOnly ? "bg-gray-50" : ""}`}
      value={value}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {NORMAL_ABNORMAL.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function TabularResultCell({
  def,
  entry,
  readOnly,
  onChange,
}: {
  def: InvestigationDef;
  entry: InvestigationEntry;
  readOnly?: boolean;
  onChange: (patch: Partial<InvestigationEntry>) => void;
}) {
  if (def.kind === "select") {
    return (
      <select
        className={`${inputClass} ${readOnly ? "bg-gray-50" : ""}`}
        value={entry.value ?? ""}
        disabled={readOnly}
        onChange={(e) => onChange({ value: e.target.value })}
      >
        <option value="">Select…</option>
        {def.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  const textareaClass = `${inputClass} min-h-[56px] resize-y ${readOnly ? "bg-gray-50" : ""}`;

  if (def.kind === "findings_flag") {
    return (
      <textarea
        className={textareaClass}
        value={entry.findings ?? ""}
        readOnly={readOnly}
        placeholder={INVESTIGATION_RESULT_SUMMARY_PLACEHOLDER}
        onChange={(e) => onChange({ findings: e.target.value })}
      />
    );
  }

  return (
    <textarea
      className={textareaClass}
      value={entry.value ?? ""}
      readOnly={readOnly}
      placeholder={
        def.kind === "result_flag"
          ? def.placeholder ?? INVESTIGATION_RESULT_SUMMARY_PLACEHOLDER
          : INVESTIGATION_RESULT_SUMMARY_PLACEHOLDER
      }
      onChange={(e) => onChange({ value: e.target.value })}
    />
  );
}

export default function MedicalInvestigationsSection({
  responses,
  onChange,
  readOnly,
  defs,
}: {
  responses: MedicalFormResponses;
  onChange: (next: MedicalFormResponses) => void;
  readOnly?: boolean;
  defs: InvestigationDef[];
}) {
  const data: InvestigationsData = responses.investigations ?? emptyInvestigationsData();
  const attachments = responses.attachments ?? [];

  const updateInvestigations = (next: InvestigationsData) => {
    onChange({ ...responses, investigations: next });
  };

  const setAttachments = (next: MedicalAttachment[]) => {
    onChange({ ...responses, attachments: next });
  };

  const updateTest = (testId: string, patch: Partial<InvestigationEntry>) => {
    const prev = data.tests[testId] ?? {};
    updateInvestigations({
      ...data,
      tests: {
        ...data.tests,
        [testId]: { ...prev, ...patch },
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

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="py-2.5 px-3 font-semibold min-w-[180px]">Investigation</th>
              <th className="py-2.5 px-3 font-semibold min-w-[160px]">Result summary</th>
              <th className="py-2.5 px-3 font-semibold w-[130px]">Flag (N/ABN)</th>
            </tr>
          </thead>
          <tbody>
            {defs.map((def) => {
              const entry = data.tests[def.id] ?? {};
              return (
                <tr key={def.id} className="border-b border-gray-100 align-top">
                  <td className="py-2.5 px-3 text-gray-800 font-medium">{def.label}</td>
                  <td className="py-2 px-3">
                    <TabularResultCell
                      def={def}
                      entry={entry}
                      readOnly={readOnly}
                      onChange={(patch) => updateTest(def.id, patch)}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <FlagSelect
                      value={entry.flag ?? ""}
                      readOnly={readOnly}
                      onChange={(flag) => updateTest(def.id, { flag })}
                    />
                  </td>
                </tr>
              );
            })}
            {otherEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-gray-100 align-top">
                <td className="py-2 px-3">
                  <input
                    className={inputClass}
                    value={entry.name}
                    readOnly={readOnly}
                    placeholder="Investigation name"
                    onChange={(e) => updateOtherEntry(entry.id, { name: e.target.value })}
                  />
                </td>
                <td className="py-2 px-3">
                  <textarea
                    className={`${inputClass} min-h-[56px] resize-y ${readOnly ? "bg-gray-50" : ""}`}
                    value={entry.result ?? ""}
                    readOnly={readOnly}
                    placeholder={INVESTIGATION_RESULT_SUMMARY_PLACEHOLDER}
                    onChange={(e) => updateOtherEntry(entry.id, { result: e.target.value })}
                  />
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1">
                    <FlagSelect
                      value={entry.flag ?? ""}
                      readOnly={readOnly}
                      onChange={(flag) => updateOtherEntry(entry.id, { flag })}
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => removeOtherEntry(entry.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded shrink-0"
                        aria-label="Remove investigation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
          <button
            type="button"
            onClick={addOtherEntry}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800"
          >
            <Plus className="w-3.5 h-3.5" /> Add other investigation
          </button>
        </div>
      )}
      <MedicalExamAttachmentsUpload
        attachments={attachments}
        onChange={setAttachments}
        readOnly={readOnly}
      />
    </div>
  );
}
