"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, Save, Send } from "lucide-react";
import type { MedicalFormResponses, MedicalFormSchema, MedicalReferralData, MedicalSection } from "@/lib/medical/medicalFormSchema";
import { withMedicalReferralPrefills } from "@/lib/medical/medicalResponses";
import { getInvestigationDefs, medicalFieldLabel } from "@/lib/medical/medicalFormSchema";
import type { PipField, PipTableColumn } from "@/lib/appraisal/pipFormSchema";
import { FormShell } from "@/components/Forms/FormShell";
import ClinicalVitalsSection from "./ClinicalVitalsSection";
import MedicalInvestigationsSection from "./MedicalInvestigationsSection";

const NAVY = "#1e3a5f";
const BRAND = "#dc2626";

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";
const lockedClass =
  "w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700";
const errorClass =
  "w-full border border-red-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30";

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="block text-xs font-medium text-gray-700 mb-1">
      {label}
      {required ? <span className="text-red-600 ml-0.5">*</span> : null}
    </span>
  );
}

function ReferralSummary({ referral }: { referral: MedicalReferralData }) {
  const items = [
    ["Candidate", referral.full_name],
    ["Job reference", referral.reference_number],
    ["Ghana Card", referral.ghana_card],
    ["Date of birth", referral.date_of_birth],
    ["Gender", referral.gender],
    ["Position offered", referral.position_offered],
    ["Department / site", referral.department_site],
    ["Examination type", referral.examination_type],
    ["Job category", referral.job_category],
    ["Designated facility", referral.designated_facility],
    ["Appointment date", referral.appointment_date],
    ["Referral date", referral.referral_date],
    ["Issued by", referral.issued_by],
  ].filter(([, v]) => v?.toString().trim());

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 mb-6">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-900 mb-3">Referral details (Part 1)</p>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] uppercase tracking-wide text-blue-700/70">{label}</dt>
            <dd className="font-medium text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  readOnly,
  error,
}: {
  field: PipField;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  error?: boolean;
}) {
  if (field.type === "system") return null;
  const cls = readOnly ? lockedClass : error ? errorClass : inputClass;
  const required = field.required === true;
  const label = medicalFieldLabel(field);

  if (field.type === "textarea") {
    return (
      <div>
        <FieldLabel label={label} required={required} />
        <textarea
          className={`${cls} min-h-[100px]`}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (field.type === "select" && field.options?.length) {
    return (
      <div>
        <FieldLabel label={label} required={required} />
        <select
          className={cls}
          value={value}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <FieldLabel label={label} required={required} />
      <input
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        className={cls}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TableEditor({
  section,
  rows,
  onChange,
  readOnly,
  fieldErrors,
}: {
  section: Extract<MedicalSection, { kind: "table" }>;
  rows: Array<Record<string, string | number | null>>;
  onChange: (rows: Array<Record<string, string | number | null>>) => void;
  readOnly?: boolean;
  fieldErrors?: Set<string>;
}) {
  const isFixedLabelCol = section.key === "medical_history" || section.key === "clinical_systems";
  const labelColKey = section.key === "medical_history" ? "item" : section.key === "clinical_systems" ? "system" : null;

  const renderCell = (col: PipTableColumn, row: Record<string, string | number | null>, rowIndex: number) => {
    const value = String(row[col.key] ?? "");
    const locked = readOnly || (isFixedLabelCol && col.key === labelColKey);
    const cls = locked ? lockedClass : fieldErrors?.has(`${section.key}.${rowIndex}.${col.key}`) ? errorClass : inputClass;

    if (col.type === "select" && col.options?.length) {
      return (
        <select
          className={cls}
          value={value}
          disabled={locked}
          onChange={(e) => {
            const next = rows.map((r, i) =>
              i === rowIndex ? { ...r, [col.key]: e.target.value } : r,
            );
            onChange(next);
          }}
        >
          <option value="">—</option>
          {col.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        className={cls}
        value={value}
        readOnly={locked}
        onChange={(e) => {
          const next = rows.map((r, i) =>
            i === rowIndex ? { ...r, [col.key]: e.target.value } : r,
          );
          onChange(next);
        }}
      />
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {section.columns.map((col) => (
              <th key={col.key} className="text-left px-2 py-2 text-xs font-semibold text-gray-600">
                {col.label}
                {section.key === "medical_history" && col.key === "yes_no" ? (
                  <span className="text-red-600 ml-0.5">*</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-gray-100">
              {section.columns.map((col) => (
                <td key={col.key} className="px-2 py-2 align-top min-w-[120px]">
                  {renderCell(col, row, rowIndex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MedicalExamWizard({
  token,
  initialSchema,
  initialResponses,
  initialReferral,
  readOnly: initialReadOnly,
}: {
  token: string;
  initialSchema: MedicalFormSchema;
  initialResponses: MedicalFormResponses;
  initialReferral: MedicalReferralData;
  readOnly?: boolean;
}) {
  const [schema] = useState(initialSchema);
  const facilityFromReferral = initialReferral.designated_facility?.trim() ?? "";
  const [responses, setResponses] = useState(() =>
    withMedicalReferralPrefills(initialResponses, initialReferral),
  );
  const [readOnly, setReadOnly] = useState(initialReadOnly ?? false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(initialReadOnly ?? false);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

  const setFieldValue = useCallback((key: string, value: string) => {
    setResponses((prev) => ({
      ...prev,
      fields: { ...(prev.fields ?? {}), [key]: value },
    }));
  }, []);

  const setTableRows = useCallback((key: string, rows: Array<Record<string, string | number | null>>) => {
    setResponses((prev) => ({
      ...prev,
      tables: { ...(prev.tables ?? {}), [key]: rows },
    }));
  }, []);

  const persist = async (finalize: boolean) => {
    setError(null);
    if (finalize) setSubmitting(true);
    else setSaving(true);

    try {
      const res = await fetch(`/api/medical/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_responses: responses, finalize }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (Array.isArray(json.errors)) setFieldErrors(new Set());
        throw new Error(json.error ?? "Could not save.");
      }
      if (finalize) {
        setSubmitted(true);
        setReadOnly(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const sections = useMemo(() => schema.sections, [schema.sections]);
  const investigationDefs = useMemo(() => getInvestigationDefs(schema), [schema]);

  if (submitted) {
    return (
      <FormShell eyebrow="Wills Farms" title="Examination submitted">
        <div className="text-center py-12">
          <p className="text-lg font-bold text-gray-900">Thank you</p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            The occupational medical examination has been submitted to Wills Farms HR. You may close this page.
          </p>
        </div>
      </FormShell>
    );
  }

  return (
    <FormShell eyebrow="Wills Farms" title={schema.title} subtitle="Occupational medical examination">
      <div className="pb-28 -mx-0 max-w-none">
        {schema.intro && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 leading-relaxed mb-6">
            {schema.intro}
          </div>
        )}

        <ReferralSummary referral={initialReferral} />

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <div className="space-y-5">
          {sections.map((section, index) => (
            <section key={section.key} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3" style={{ backgroundColor: NAVY }}>
                <h2 className="text-sm font-semibold text-white">
                  {index + 1}. {section.title}
                </h2>
              </div>
              <div className="p-4 sm:p-5 space-y-4">
                {section.helpText && (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    {section.helpText}
                  </p>
                )}
                {section.kind === "fields" && section.key === "clinical_vitals" ? (
                  <ClinicalVitalsSection
                    fields={section.fields}
                    responses={responses}
                    onChange={setResponses}
                    readOnly={readOnly}
                  />
                ) : section.kind === "fields" && section.key === "investigations" ? (
                  <MedicalInvestigationsSection
                    responses={responses}
                    onChange={setResponses}
                    readOnly={readOnly}
                    defs={investigationDefs}
                  />
                ) : section.kind === "fields" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {section.fields.map((field) =>
                      field.type === "system" ||
                      (section.key === "fitness" && field.key === "licence_no") ? null : (
                        <div
                          key={field.key}
                          className={field.type === "textarea" ? "md:col-span-2" : undefined}
                        >
                          <FieldInput
                            field={field}
                            value={
                              field.key === "facility_name"
                                ? String(
                                    responses.fields?.[field.key] ?? facilityFromReferral ?? "",
                                  )
                                : String(responses.fields?.[field.key] ?? "")
                            }
                            onChange={(v) => setFieldValue(field.key, v)}
                            readOnly={
                              readOnly ||
                              (field.key === "facility_name" && !!facilityFromReferral)
                            }
                            error={fieldErrors.has(field.key)}
                          />
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <TableEditor
                    section={section}
                    rows={
                      responses.tables?.[section.key] ??
                      Array.from({ length: section.minRows || 1 }, () =>
                        Object.fromEntries(section.columns.map((c) => [c.key, ""])),
                      )
                    }
                    onChange={(rows) => setTableRows(section.key, rows)}
                    readOnly={readOnly}
                    fieldErrors={fieldErrors}
                  />
                )}
              </div>
            </section>
          ))}
        </div>

        {!readOnly && (
          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur">
            <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => persist(false)}
                disabled={saving || submitting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save progress
              </button>
              <button
                type="button"
                onClick={() => persist(true)}
                disabled={saving || submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit to HR
              </button>
            </div>
          </div>
        )}
      </div>
    </FormShell>
  );
}
