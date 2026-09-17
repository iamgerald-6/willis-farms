"use client";

import { X } from "lucide-react";
import type { MedicalFormResponses, MedicalFormSchema, MedicalReferralData } from "@/lib/medical/medicalFormSchema";
import { getInvestigationDefs, medicalFieldLabel } from "@/lib/medical/medicalFormSchema";
import { isSystemField } from "@/lib/appraisal/pipFormSchema";
import type {
  InvestigationDef,
  InvestigationEntry,
  InvestigationsData,
} from "@/lib/medical/medicalInvestigationDefs";

const NAVY = "#1e3a5f";

function InvestigationsPreview({
  data,
  defs,
}: {
  data: InvestigationsData | undefined;
  defs: InvestigationDef[];
}) {
  const investigations = data ?? { tests: {}, lab_reports: [], other: [] };
  const hasReports = (investigations.lab_reports ?? []).length > 0;
  const hasOther = (investigations.other ?? []).some((o) => o.name?.trim() || o.result?.trim());
  const hasTests = defs.some((def) => {
    const entry = investigations.tests[def.id];
    if (!entry) return false;
    if (def.kind === "panel") {
      return Object.values(entry.parameters ?? {}).some((p) => p.value?.trim());
    }
    return !!(entry.value?.trim() || entry.comment?.trim() || entry.findings?.trim() || entry.flag?.trim());
  });

  if (!hasReports && !hasTests && !hasOther) {
    return <p className="text-xs text-gray-400 italic">No investigation results recorded.</p>;
  }

  return (
    <div className="space-y-3">
      {(investigations.lab_reports ?? []).length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Attached reports</p>
          <ul className="space-y-1">
            {(investigations.lab_reports ?? []).map((report) => (
              <li key={report.secure_url}>
                <a
                  href={report.secure_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-800 hover:underline"
                >
                  {report.original_name ?? "Lab report"}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {defs.map((def) => {
        const entry: InvestigationEntry = investigations.tests[def.id] ?? {};
        if (def.kind === "select" || def.kind === "text") {
          if (!entry.value?.trim() && !entry.comment?.trim()) return null;
          return (
            <div key={def.id} className="border border-gray-100 rounded-lg p-2">
              <p className="text-xs font-semibold text-gray-700">{def.label}</p>
              {entry.value?.trim() && <p className="text-xs text-gray-800 mt-0.5">{entry.value}</p>}
              {entry.comment?.trim() && (
                <p className="text-[11px] text-gray-500 mt-0.5">{entry.comment}</p>
              )}
            </div>
          );
        }
        if (def.kind === "findings_flag") {
          if (!entry.findings?.trim() && !entry.flag?.trim()) return null;
          return (
            <div key={def.id} className="border border-gray-100 rounded-lg p-2">
              <p className="text-xs font-semibold text-gray-700">{def.label}</p>
              {entry.findings?.trim() && (
                <p className="text-xs text-gray-800 mt-0.5 whitespace-pre-wrap">{entry.findings}</p>
              )}
              {entry.flag?.trim() && (
                <p className="text-[11px] text-gray-500 mt-0.5">{entry.flag}</p>
              )}
            </div>
          );
        }
        const params = def.parameters.filter((p) => entry.parameters?.[p.key]?.value?.trim());
        if (params.length === 0) return null;
        return (
          <div key={def.id} className="border border-gray-100 rounded-lg p-2">
            <p className="text-xs font-semibold text-gray-700 mb-1">{def.label}</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left py-0.5 pr-2 font-medium">Parameter</th>
                  <th className="text-left py-0.5 pr-2 font-medium">Result</th>
                  <th className="text-left py-0.5 pr-2 font-medium">Unit</th>
                  <th className="text-left py-0.5 pr-2 font-medium">Ref.</th>
                  <th className="text-left py-0.5 font-medium">Flag</th>
                </tr>
              </thead>
              <tbody>
                {params.map((p) => {
                  const pv = entry.parameters?.[p.key] ?? {};
                  return (
                    <tr key={p.key} className="border-t border-gray-50">
                      <td className="py-0.5 pr-2 text-gray-600">{p.label}</td>
                      <td className="py-0.5 pr-2 text-gray-800">{pv.value}</td>
                      <td className="py-0.5 pr-2 text-gray-500">{pv.unit || p.defaultUnit || "—"}</td>
                      <td className="py-0.5 pr-2 text-gray-500">
                        {pv.reference_range || p.defaultReferenceRange || "—"}
                      </td>
                      <td className="py-0.5 text-gray-500">{pv.flag || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {hasOther && (
        <div className="border border-gray-100 rounded-lg p-2">
          <p className="text-xs font-semibold text-gray-700 mb-1">Other investigation</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left py-0.5 pr-2 font-medium">Investigation</th>
                <th className="text-left py-0.5 pr-2 font-medium">Result</th>
                <th className="text-left py-0.5 pr-2 font-medium">Unit</th>
                <th className="text-left py-0.5 pr-2 font-medium">Ref.</th>
                <th className="text-left py-0.5 font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {(investigations.other ?? [])
                .filter((o) => o.name?.trim() || o.result?.trim())
                .map((o) => (
                  <tr key={o.id} className="border-t border-gray-50">
                    <td className="py-0.5 pr-2 text-gray-600">{o.name || "—"}</td>
                    <td className="py-0.5 pr-2 text-gray-800">{o.result || "—"}</td>
                    <td className="py-0.5 pr-2 text-gray-500">{o.unit || "—"}</td>
                    <td className="py-0.5 pr-2 text-gray-500">{o.reference_range || "—"}</td>
                    <td className="py-0.5 text-gray-500">{o.flag || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
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

          {schema.sections.map((section) => (
            <div key={section.key}>
              <h3 className="font-semibold text-gray-900 mb-2">{section.title}</h3>
              {section.kind === "fields" && section.key === "investigations" ? (
                <InvestigationsPreview data={responses.investigations} defs={investigationDefs} />
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
                  {section.fields.filter((f) => !isSystemField(f)).map((field) => (
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
