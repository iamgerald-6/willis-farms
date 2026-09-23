"use client";

import { useEffect } from "react";
import type { MedicalFormResponses } from "@/lib/medical/medicalFormSchema";
import {
  calculateBmi,
  HEARING_FAIL_NOTE_KEYS,
  HEARING_RESULT_OPTIONS,
  VISUAL_ACUITY_FAIL_NOTE_KEYS,
  VISUAL_ACUITY_RESULT_OPTIONS,
} from "@/lib/medical/medicalClinicalVitals";
import type { PipField } from "@/lib/appraisal/pipFormSchema";
import { medicalFieldLabel } from "@/lib/medical/medicalFormSchema";

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";
const lockedClass =
  "w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700";

const GROUPED_KEYS = new Set([
  "bp_systolic",
  "bp_diastolic",
  "visual_acuity_right",
  "visual_acuity_left",
  "visual_acuity_right_fail_note",
  "visual_acuity_left_fail_note",
  "hearing_left",
  "hearing_right",
  "hearing_left_fail_note",
  "hearing_right_fail_note",
]);

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="block text-xs font-medium text-gray-700 mb-1">
      {label}
      {required ? <span className="text-red-600 ml-0.5">*</span> : null}
    </span>
  );
}

function fieldRequired(f?: PipField): boolean {
  return !!f && f.type !== "system" && f.required === true;
}

function isFailResult(value: string): boolean {
  return value.trim().toLowerCase() === "fail";
}

function GroupCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4 md:col-span-2">
      <p className="text-sm font-semibold text-gray-900 mb-3">{title}</p>
      {children}
    </div>
  );
}

export default function ClinicalVitalsSection({
  fields,
  responses,
  onChange,
  readOnly,
}: {
  fields: PipField[];
  responses: MedicalFormResponses;
  onChange: (next: MedicalFormResponses) => void;
  readOnly?: boolean;
}) {
  const values = responses.fields ?? {};
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const setField = (key: string, value: string) => {
    const nextFields = { ...(responses.fields ?? {}), [key]: value };
    const bmi = calculateBmi(nextFields.height_cm, nextFields.weight_kg);
    if (bmi) nextFields.bmi = bmi;
    onChange({ ...responses, fields: nextFields });
  };

  const setVisualAcuityResult = (
    eyeKey: "visual_acuity_right" | "visual_acuity_left",
    value: string,
  ) => {
    const nextFields = { ...(responses.fields ?? {}), [eyeKey]: value };
    if (!isFailResult(value)) {
      nextFields[VISUAL_ACUITY_FAIL_NOTE_KEYS[eyeKey]] = "";
    }
    const bmi = calculateBmi(nextFields.height_cm, nextFields.weight_kg);
    if (bmi) nextFields.bmi = bmi;
    onChange({ ...responses, fields: nextFields });
  };

  const setHearingResult = (earKey: "hearing_left" | "hearing_right", value: string) => {
    const nextFields = { ...(responses.fields ?? {}), [earKey]: value };
    if (!isFailResult(value)) {
      nextFields[HEARING_FAIL_NOTE_KEYS[earKey]] = "";
    }
    const bmi = calculateBmi(nextFields.height_cm, nextFields.weight_kg);
    if (bmi) nextFields.bmi = bmi;
    onChange({ ...responses, fields: nextFields });
  };

  useEffect(() => {
    const bmi = calculateBmi(values.height_cm, values.weight_kg);
    if (bmi && values.bmi !== bmi) {
      onChange({ ...responses, fields: { ...values, bmi } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.height_cm, values.weight_kg]);

  const val = (key: string) => String(values[key] ?? "");
  const req = (key: string) => fieldRequired(byKey.get(key));

  const renderField = (field: PipField) => {
    if (field.type === "system") return null;
    const label = medicalFieldLabel(field);
    const required = field.required === true;
    const value = String(values[field.key] ?? "");
    const isBmi = field.key === "bmi";
    const cls = readOnly || isBmi ? lockedClass : inputClass;

    if (field.type === "textarea") {
      return (
        <div key={field.key} className="md:col-span-2">
          <FieldLabel label={label} required={required} />
          <textarea
            className={`${cls} min-h-[80px]`}
            value={value}
            readOnly={readOnly}
            onChange={(e) => setField(field.key, e.target.value)}
          />
        </div>
      );
    }

    if (field.type === "select" && field.options?.length) {
      return (
        <div key={field.key}>
          <FieldLabel label={label} required={required} />
          <select
            className={cls}
            value={value}
            disabled={readOnly}
            onChange={(e) => setField(field.key, e.target.value)}
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
      <div key={field.key}>
        <FieldLabel label={label} required={required && !isBmi} />
        <input
          type={field.type === "number" ? "number" : "text"}
          className={cls}
          value={value}
          readOnly={readOnly || isBmi}
          onChange={(e) => setField(field.key, e.target.value)}
        />
      </div>
    );
  };

  const ungroupedFields = fields.filter(
    (f) => f.type !== "system" && !GROUPED_KEYS.has(f.key),
  );

  const hasVisualAcuity = byKey.has("visual_acuity_right") || byKey.has("visual_acuity_left");
  const hasBp = byKey.has("bp_systolic") || byKey.has("bp_diastolic");
  const hasHearing = byKey.has("hearing_left") || byKey.has("hearing_right");

  const renderVisualAcuityEye = (
    eyeKey: "visual_acuity_right" | "visual_acuity_left",
    shortLabel: string,
  ) => {
    const field = byKey.get(eyeKey);
    if (!field || field.type === "system") return null;

    const noteKey = VISUAL_ACUITY_FAIL_NOTE_KEYS[eyeKey];
    const result = val(eyeKey);
    const options =
      field.type === "select" && field.options?.length
        ? field.options
        : [...VISUAL_ACUITY_RESULT_OPTIONS];
    const useSelect = field.type === "select" || options.length > 0;

    return (
      <div key={eyeKey} className="space-y-2">
        <div>
          <FieldLabel label={shortLabel} required={req(eyeKey)} />
          {useSelect ? (
            <select
              className={readOnly ? lockedClass : inputClass}
              value={result}
              disabled={readOnly}
              onChange={(e) => setVisualAcuityResult(eyeKey, e.target.value)}
            >
              <option value="">Select…</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={readOnly ? lockedClass : inputClass}
              value={result}
              readOnly={readOnly}
              placeholder="e.g. 6/6"
              onChange={(e) => setField(eyeKey, e.target.value)}
            />
          )}
        </div>
        {useSelect && isFailResult(result) && (
          <div>
            <FieldLabel label="Reason for fail" required />
            <textarea
              className={`${readOnly ? lockedClass : inputClass} min-h-[72px]`}
              value={val(noteKey)}
              readOnly={readOnly}
              placeholder="Brief clinical note explaining the fail result"
              onChange={(e) => setField(noteKey, e.target.value)}
            />
          </div>
        )}
      </div>
    );
  };

  const renderHearingEar = (earKey: "hearing_left" | "hearing_right", shortLabel: string) => {
    const field = byKey.get(earKey);
    if (!field || field.type === "system") return null;

    const noteKey = HEARING_FAIL_NOTE_KEYS[earKey];
    const result = val(earKey);
    const options =
      field.type === "select" && field.options?.length
        ? field.options
        : [...HEARING_RESULT_OPTIONS];

    return (
      <div key={earKey} className="space-y-2">
        <div>
          <FieldLabel label={shortLabel} required={req(earKey)} />
          <select
            className={readOnly ? lockedClass : inputClass}
            value={result}
            disabled={readOnly}
            onChange={(e) => setHearingResult(earKey, e.target.value)}
          >
            <option value="">Select…</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        {isFailResult(result) && (
          <div>
            <FieldLabel label="Reason for fail" required />
            <textarea
              className={`${readOnly ? lockedClass : inputClass} min-h-[72px]`}
              value={val(noteKey)}
              readOnly={readOnly}
              placeholder="Brief clinical note explaining the fail result"
              onChange={(e) => setField(noteKey, e.target.value)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {ungroupedFields.map((field) => renderField(field))}

      {hasBp && (
        <GroupCard title="Blood pressure (mmHg)">
          <div className="flex items-end gap-2 max-w-xs">
            <div className="flex-1">
              <FieldLabel label="Systolic" required={req("bp_systolic")} />
              <input
                type="number"
                inputMode="numeric"
                className={readOnly ? lockedClass : inputClass}
                value={val("bp_systolic")}
                readOnly={readOnly}
                onChange={(e) => setField("bp_systolic", e.target.value)}
              />
            </div>
            <span className="pb-2.5 text-gray-400 font-semibold">/</span>
            <div className="flex-1">
              <FieldLabel label="Diastolic" required={req("bp_diastolic")} />
              <input
                type="number"
                inputMode="numeric"
                className={readOnly ? lockedClass : inputClass}
                value={val("bp_diastolic")}
                readOnly={readOnly}
                onChange={(e) => setField("bp_diastolic", e.target.value)}
              />
            </div>
            <span className="pb-2.5 text-xs text-gray-500">mmHg</span>
          </div>
        </GroupCard>
      )}

      {hasVisualAcuity && (
        <GroupCard title="Visual acuity">
          <div className="grid sm:grid-cols-2 gap-4">
            {renderVisualAcuityEye("visual_acuity_right", "Right eye")}
            {renderVisualAcuityEye("visual_acuity_left", "Left eye")}
          </div>
        </GroupCard>
      )}

      {hasHearing && (
        <GroupCard title="Hearing">
          <div className="grid sm:grid-cols-2 gap-4">
            {renderHearingEar("hearing_left", "Left ear")}
            {renderHearingEar("hearing_right", "Right ear")}
          </div>
        </GroupCard>
      )}
    </div>
  );
}
