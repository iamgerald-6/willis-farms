"use client";

import { X } from "lucide-react";
import type { MedicalFormResponses, MedicalFormSchema, MedicalReferralData } from "@/lib/medical/medicalFormSchema";
import { getInvestigationDefs, medicalFieldLabel } from "@/lib/medical/medicalFormSchema";
import { isSystemField } from "@/lib/appraisal/pipFormSchema";
import {
  investigationResultSummary,
  investigationRowHasData,
  type InvestigationDef,
  type InvestigationEntry,
  type InvestigationsData,
} from "@/lib/medical/medicalInvestigationDefs";

const NAVY = "#1e3a5f";

function getMedicalExamAttachments(responses: MedicalFormResponses) {
  const seen = new Set<string>();
  const docs = [];
  for (const doc of [
    ...(responses.attachments ?? []),
    ...(responses.investigations?.lab_reports ?? []),
  ]) {
    if (seen.has(doc.secure_url)) continue;
    seen.add(doc.secure_url);
    docs.push(doc);
  }
  return docs;
}

function InvestigationsPreview({
  data,
  defs,
  attachments,
}: {
  data: InvestigationsData | undefined;
  defs: InvestigationDef[];
  attachments: ReturnType<typeof getMedicalExamAttachments>;
}) {
  const investigations = data ?? { tests: {}, other: [] };
  const otherRows = (investigations.other ?? []).filter((o) => o.name?.trim() || o.result?.trim());
  const tableRows = [
    ...defs.map((def) => ({
      key: def.id,
      label: def.label,
      def,
      entry: investigations.tests[def.id] ?? {},
    })),
    ...otherRows.map((o) => ({
      key: o.id,
      label: o.name || "—",
      def: null as InvestigationDef | null,
      entry: { value: o.result, flag: o.flag } as InvestigationEntry,
    })),
  ];
  const hasData = tableRows.some((row) =>
    row.def ? investigationRowHasData(row.def, row.entry) : !!(row.entry.value?.trim() || row.entry.flag?.trim()),
  );

  if (!hasData && attachments.length === 0) {
    return <p className="text-xs text-gray-400 italic">No investigation results recorded.</p>;
  }

  return (
    <div className="space-y-3">
    {hasData ? (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500">
            <th className="text-left py-1.5 px-2 font-medium">Investigation</th>
            <th className="text-left py-1.5 px-2 font-medium">Result summary</th>
            <th className="text-left py-1.5 px-2 font-medium">Flag (N/ABN)</th>
          </tr>
        </thead>
        <tbody>
          {tableRows
            .filter((row) =>
              row.def
                ? investigationRowHasData(row.def, row.entry)
                : !!(row.entry.value?.trim() || row.entry.flag?.trim()),
            )
            .map((row) => (
              <tr key={row.key} className="border-t border-gray-50">
                <td className="py-1.5 px-2 text-gray-700 font-medium">{row.label}</td>
                <td className="py-1.5 px-2 text-gray-800 whitespace-pre-wrap">
                  {row.def
                    ? investigationResultSummary(row.def, row.entry) || "—"
                    : row.entry.value?.trim() || "—"}
                </td>
                <td className="py-1.5 px-2 text-gray-500">{row.entry.flag?.trim() || "—"}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
    ) : null}
    {attachments.length > 0 ? (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
          Uploaded test results &amp; imaging
        </p>
        <ul className="space-y-1">
          {attachments.map((doc) => (
            <li key={doc.secure_url}>
              <a
                href={doc.secure_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-800 hover:underline"
              >
                {doc.original_name ?? "Document"}
              </a>
            </li>
          ))}
        </ul>
      </div>
    ) : null}
    </div>
  );
}

export default function MedicalExamPreviewModal({
  open,
  onClose,
  schema,
  responses,
  referral,
  status,
  submittedAt,
}: {
  open: boolean;
  onClose: () => void;
  schema: MedicalFormSchema;
  responses: MedicalFormResponses;
  referral: MedicalReferralData;
  status: string;
  submittedAt?: string | null;
}) {
  if (!open) return null;

  const statusLabel = status === "submitted" ? "Submitted" : "In progress";
  const investigationDefs = getInvestigationDefs(schema);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-3xl max-h-[90vh] overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100" style={{ backgroundColor: NAVY }}>
          <div>
            <p className="text-sm font-semibold text-white">{schema.title}</p>
            <p className="text-[11px] text-white/70">{statusLabel}{submittedAt ? ` · ${new Date(submittedAt).toLocaleDateString("en-GB")}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-6 space-y-5 text-sm">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
            <p className="text-xs font-bold text-blue-900 mb-2">Referral (Part 1)</p>
            <dl className="grid sm:grid-cols-2 gap-2 text-xs">
              {[
                ["Candidate", referral.full_name],
                ["Reference", referral.reference_number],
                ["Position", referral.position_offered],
                ["Examination type", referral.examination_type],
                ["Job category", referral.job_category],
                ["Facility", referral.designated_facility],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-gray-400">{k}</dt>
                    <dd className="font-medium text-gray-800">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>

          {schema.sections
            .filter((section) => section.key !== "supporting_documents")
            .map((section) => (
            <div key={section.key}>
              <h3 className="font-semibold text-gray-900 mb-2">{section.title}</h3>
              {section.kind === "fields" && section.key === "investigations" ? (
                <InvestigationsPreview
                  data={responses.investigations}
                  defs={investigationDefs}
                  attachments={getMedicalExamAttachments(responses)}
                />
              ) : section.kind === "fields" && section.key === "clinical_vitals" ? (
                <dl className="space-y-2">
                  {section.fields.filter((f) => !isSystemField(f)).map((field) => (
                    <div key={field.key} className="grid sm:grid-cols-3 gap-1 border-b border-gray-50 pb-2">
                      <dt className="text-gray-500 text-xs">{medicalFieldLabel(field)}</dt>
                      <dd className="sm:col-span-2 text-gray-800 whitespace-pre-wrap">
                        {responses.fields?.[field.key]?.toString() || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : section.kind === "fields" ? (
                <dl className="space-y-2">
                  {section.fields
                    .filter((f) => !isSystemField(f) && f.key !== "licence_no")
                    .map((field) => (
                    <div key={field.key} className="grid sm:grid-cols-3 gap-1 border-b border-gray-50 pb-2">
                      <dt className="text-gray-500 text-xs">{medicalFieldLabel(field)}</dt>
                      <dd className="sm:col-span-2 text-gray-800 whitespace-pre-wrap">
                        {responses.fields?.[field.key]?.toString() || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-gray-100">
                    <thead>
                      <tr className="bg-gray-50">
                        {section.columns.map((col) => (
                          <th key={col.key} className="text-left px-2 py-1.5 font-medium text-gray-600">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(responses.tables?.[section.key] ?? []).map((row, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          {section.columns.map((col) => (
                            <td key={col.key} className="px-2 py-1.5 text-gray-800">
                              {row[col.key]?.toString() || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
