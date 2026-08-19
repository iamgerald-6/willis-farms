"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { WorkHistoryEntry } from "@/lib/careers/applicationFormSchema";

type Props = {
  value: unknown;
  onChange: (next: WorkHistoryEntry[]) => void;
};

function emptyEntry(): WorkHistoryEntry {
  return { company: "", title: "", start: "", end: "", current: false };
}

function normalize(value: unknown): WorkHistoryEntry[] {
  if (!Array.isArray(value) || value.length === 0) return [emptyEntry()];
  return value.map((entry) => ({
    company: String((entry as WorkHistoryEntry)?.company ?? ""),
    title: String((entry as WorkHistoryEntry)?.title ?? ""),
    start: String((entry as WorkHistoryEntry)?.start ?? ""),
    end: String((entry as WorkHistoryEntry)?.end ?? ""),
    current: Boolean((entry as WorkHistoryEntry)?.current),
  }));
}

const fieldLabelClass = "text-xs font-medium text-gray-600";
const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

export function WorkHistoryInput({ value, onChange }: Props) {
  const entries = normalize(value);
  const idBase = useId();

  const update = (index: number, patch: Partial<WorkHistoryEntry>) => {
    const next = entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
    onChange(next);
  };

  const removeEntry = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyEntry()]);
  };

  const addEntry = () => onChange([...entries, emptyEntry()]);

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <div
          key={`${idBase}-${index}`}
          className="border border-gray-200 rounded-lg p-3 space-y-2"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <span className={fieldLabelClass}>Place of work</span>
              <input
                className={`${inputClass} mt-1`}
                type="text"
                value={entry.company}
                onChange={(e) => update(index, { company: e.target.value })}
                placeholder="e.g. Wills Farms Ltd."
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <span className={fieldLabelClass}>Job title</span>
              <input
                className={`${inputClass} mt-1`}
                type="text"
                value={entry.title}
                onChange={(e) => update(index, { title: e.target.value })}
                placeholder="e.g. Swine Technician"
              />
            </div>
            <div className="min-w-[130px]">
              <span className={fieldLabelClass}>Start</span>
              <input
                className={`${inputClass} mt-1`}
                type="month"
                value={entry.start}
                onChange={(e) => update(index, { start: e.target.value })}
              />
            </div>
            <div className="min-w-[130px]">
              <span className={fieldLabelClass}>End</span>
              <input
                className={`${inputClass} mt-1 disabled:bg-gray-50 disabled:text-gray-400`}
                type="month"
                value={entry.end}
                disabled={entry.current}
                onChange={(e) => update(index, { end: e.target.value })}
              />
            </div>
            {entries.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntry(index)}
                className="p-2 rounded-lg hover:bg-red-50 shrink-0"
                aria-label="Remove this work experience"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={entry.current}
              onChange={(e) => update(index, { current: e.target.checked, end: "" })}
            />
            I currently work here
          </label>
        </div>
      ))}

      <button
        type="button"
        onClick={addEntry}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        <Plus className="w-3.5 h-3.5" />
        Add another work experience
      </button>
    </div>
  );
}
