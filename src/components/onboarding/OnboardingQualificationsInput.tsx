"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { INSTITUTION_TYPES } from "@/lib/careers/applicationFormSchema";
import type { OnboardingQualificationEntry } from "@/lib/careers/onboardingEntryTypes";

export type { OnboardingQualificationEntry };

type Props = {
  value: unknown;
  onChange: (next: OnboardingQualificationEntry[]) => void;
};

function emptyEntry(): OnboardingQualificationEntry {
  return { qualification: "", institution: "", field: "", year: "" };
}

function normalize(value: unknown): OnboardingQualificationEntry[] {
  if (!Array.isArray(value) || value.length === 0) return [emptyEntry()];
  return value.map((entry) => ({
    qualification: String((entry as OnboardingQualificationEntry)?.qualification ?? ""),
    institution: String((entry as OnboardingQualificationEntry)?.institution ?? ""),
    field: String((entry as OnboardingQualificationEntry)?.field ?? ""),
    year: String((entry as OnboardingQualificationEntry)?.year ?? ""),
  }));
}

const labelClass = "text-xs font-medium text-gray-600";
const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

export function OnboardingQualificationsInput({ value, onChange }: Props) {
  const entries = normalize(value);
  const idBase = useId();

  const update = (index: number, patch: Partial<OnboardingQualificationEntry>) => {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  const removeEntry = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyEntry()]);
  };

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <div
          key={`${idBase}-${index}`}
          className="border border-gray-200 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-500">
              Qualification {index + 1}
            </p>
            {entries.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntry(index)}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className={labelClass}>
                Qualification / degree obtained <span className="text-red-600">*</span>
              </span>
              <input
                className={`${inputClass} mt-1`}
                value={entry.qualification}
                onChange={(e) => update(index, { qualification: e.target.value })}
                placeholder="e.g. BSc Agriculture, WASSCE, Diploma"
              />
            </label>
            <label className="block">
              <span className={labelClass}>
                Institution <span className="text-red-600">*</span>
              </span>
              <input
                className={`${inputClass} mt-1`}
                value={entry.institution}
                onChange={(e) => update(index, { institution: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Institution type</span>
              <select
                className={`${inputClass} mt-1`}
                value={entry.field}
                onChange={(e) => update(index, { field: e.target.value })}
              >
                <option value="">Select…</option>
                {INSTITUTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Year completed</span>
              <input
                className={`${inputClass} mt-1`}
                inputMode="numeric"
                maxLength={4}
                placeholder="YYYY"
                value={entry.year}
                onChange={(e) =>
                  update(index, { year: e.target.value.replace(/\D/g, "").slice(0, 4) })
                }
              />
            </label>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...entries, emptyEntry()])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
      >
        <Plus className="w-4 h-4" />
        Add another qualification
      </button>
    </div>
  );
}

export function isQualificationEntryComplete(entry: OnboardingQualificationEntry): boolean {
  return Boolean(entry.qualification.trim() && entry.institution.trim());
}

export function hasValidQualifications(value: unknown): boolean {
  const entries = normalize(value);
  return entries.some(isQualificationEntryComplete);
}
