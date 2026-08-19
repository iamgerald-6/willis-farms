"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EducationEntry } from "@/lib/careers/applicationFormSchema";

type Props = {
  value: unknown;
  onChange: (next: EducationEntry[]) => void;
};

const INSTITUTION_TYPES = ["High School", "College", "Diploma Institution", "University", "Other"];

function emptyEntry(): EducationEntry {
  return { institutionType: "", institutionName: "", yearStarted: "", yearCompleted: "", degree: "" };
}

function normalize(value: unknown): EducationEntry[] {
  if (!Array.isArray(value) || value.length === 0) return [emptyEntry()];
  return value.map((entry) => ({
    institutionType: String((entry as EducationEntry)?.institutionType ?? ""),
    institutionName: String((entry as EducationEntry)?.institutionName ?? ""),
    yearStarted: String((entry as EducationEntry)?.yearStarted ?? ""),
    yearCompleted: String((entry as EducationEntry)?.yearCompleted ?? ""),
    degree: String((entry as EducationEntry)?.degree ?? ""),
  }));
}

const fieldLabelClass = "text-xs font-medium text-gray-600";
const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

export function EducationHistoryInput({ value, onChange }: Props) {
  const entries = normalize(value);
  const idBase = useId();

  const update = (index: number, patch: Partial<EducationEntry>) => {
    const next = entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
    onChange(next);
  };

  const removeEntry = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyEntry()]);
  };

  const addEntry = () => onChange([...entries, emptyEntry()]);

  const yearProps = {
    type: "text" as const,
    inputMode: "numeric" as const,
    maxLength: 4,
    placeholder: "YYYY",
  };

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <div
          key={`${idBase}-${index}`}
          className="border border-gray-200 rounded-lg p-3 space-y-2"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[150px]">
              <span className={fieldLabelClass}>Institution type</span>
              <select
                className={`${inputClass} mt-1`}
                value={entry.institutionType}
                onChange={(e) => update(index, { institutionType: e.target.value })}
              >
                <option value="">Select…</option>
                {INSTITUTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <span className={fieldLabelClass}>Institution name</span>
              <input
                className={`${inputClass} mt-1`}
                type="text"
                value={entry.institutionName}
                onChange={(e) => update(index, { institutionName: e.target.value })}
                placeholder="e.g. University of Ghana"
              />
            </div>
            <div className="min-w-[100px]">
              <span className={fieldLabelClass}>Year started</span>
              <input
                className={`${inputClass} mt-1`}
                {...yearProps}
                value={entry.yearStarted}
                onChange={(e) =>
                  update(index, { yearStarted: e.target.value.replace(/\D/g, "").slice(0, 4) })
                }
              />
            </div>
            <div className="min-w-[100px]">
              <span className={fieldLabelClass}>Year completed</span>
              <input
                className={`${inputClass} mt-1`}
                {...yearProps}
                value={entry.yearCompleted}
                onChange={(e) =>
                  update(index, { yearCompleted: e.target.value.replace(/\D/g, "").slice(0, 4) })
                }
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <span className={fieldLabelClass}>Degree / qualification (if applicable)</span>
              <input
                className={`${inputClass} mt-1`}
                type="text"
                value={entry.degree}
                onChange={(e) => update(index, { degree: e.target.value })}
                placeholder="e.g. BSc Animal Science"
              />
            </div>
            {entries.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntry(index)}
                className="p-2 rounded-lg hover:bg-red-50 shrink-0"
                aria-label="Remove this qualification"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            )}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addEntry}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        <Plus className="w-3.5 h-3.5" />
        Add another qualification
      </button>
    </div>
  );
}
