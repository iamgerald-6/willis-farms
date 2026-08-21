"use client";

import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { OnboardingWorkExperienceEntry } from "@/lib/careers/onboardingEntryTypes";

export type { OnboardingWorkExperienceEntry };

type Props = {
  value: unknown;
  onChange: (next: OnboardingWorkExperienceEntry[]) => void;
};

function emptyEntry(): OnboardingWorkExperienceEntry {
  return { employer: "", job_title: "", from: "", to: "", reason_leaving: "" };
}

function normalize(value: unknown): OnboardingWorkExperienceEntry[] {
  if (!Array.isArray(value) || value.length === 0) return [emptyEntry()];
  return value.map((entry) => ({
    employer: String((entry as OnboardingWorkExperienceEntry)?.employer ?? ""),
    job_title: String((entry as OnboardingWorkExperienceEntry)?.job_title ?? ""),
    from: String((entry as OnboardingWorkExperienceEntry)?.from ?? ""),
    to: String((entry as OnboardingWorkExperienceEntry)?.to ?? ""),
    reason_leaving: String((entry as OnboardingWorkExperienceEntry)?.reason_leaving ?? ""),
  }));
}

const labelClass = "text-xs font-medium text-gray-600";
const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

export function OnboardingWorkExperienceInput({ value, onChange }: Props) {
  const entries = normalize(value);
  const idBase = useId();

  const update = (index: number, patch: Partial<OnboardingWorkExperienceEntry>) => {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  const removeEntry = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyEntry()]);
  };

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => {
        const isPresent = entry.to.trim().toLowerCase() === "present";

        return (
          <div
            key={`${idBase}-${index}`}
            className="border border-gray-200 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-500">Experience {index + 1}</p>
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
              <label className="block">
                <span className={labelClass}>Employer / company</span>
                <input
                  className={`${inputClass} mt-1`}
                  value={entry.employer}
                  onChange={(e) => update(index, { employer: e.target.value })}
                  placeholder="e.g. Wills Farms Ltd."
                />
              </label>
              <label className="block">
                <span className={labelClass}>Job title</span>
                <input
                  className={`${inputClass} mt-1`}
                  value={entry.job_title}
                  onChange={(e) => update(index, { job_title: e.target.value })}
                />
              </label>
              <label className="block">
                <span className={labelClass}>From</span>
                <input
                  className={`${inputClass} mt-1`}
                  type="month"
                  value={entry.from}
                  onChange={(e) => update(index, { from: e.target.value })}
                />
              </label>
              <label className="block">
                <span className={labelClass}>To</span>
                <input
                  className={`${inputClass} mt-1 disabled:bg-gray-50 disabled:text-gray-400`}
                  type={isPresent ? "text" : "month"}
                  value={isPresent ? "Present" : entry.to}
                  disabled={isPresent}
                  onChange={(e) => update(index, { to: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={isPresent}
                  onChange={(e) =>
                    update(index, { to: e.target.checked ? "Present" : "" })
                  }
                />
                I currently work here
              </label>
              <label className="block sm:col-span-2">
                <span className={labelClass}>Reason for leaving (if applicable)</span>
                <input
                  className={`${inputClass} mt-1`}
                  value={entry.reason_leaving}
                  onChange={(e) => update(index, { reason_leaving: e.target.value })}
                  disabled={isPresent}
                />
              </label>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...entries, emptyEntry()])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
      >
        <Plus className="w-4 h-4" />
        Add another experience
      </button>
    </div>
  );
}

export function isWorkExperienceEntryComplete(entry: OnboardingWorkExperienceEntry): boolean {
  return Boolean(entry.employer.trim() && entry.job_title.trim());
}

export function hasValidWorkExperience(value: unknown): boolean {
  const entries = normalize(value);
  return entries.some(isWorkExperienceEntryComplete);
}
