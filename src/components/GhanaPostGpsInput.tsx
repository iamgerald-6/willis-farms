"use client";

import {
  formatGhanaPostGps,
  isCompleteGhanaPostGps,
} from "@/lib/careers/onboardingFormSchema";

const fieldClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

export function GhanaPostGpsInput({
  value,
  onChange,
  placeholder = "GA-123-4567",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const formatted = formatGhanaPostGps(value);
  const incomplete = formatted.length > 0 && !isCompleteGhanaPostGps(formatted);

  return (
    <div>
      <input
        type="text"
        className={fieldClass}
        placeholder={placeholder}
        value={formatted}
        onChange={(e) => onChange(formatGhanaPostGps(e.target.value))}
        autoComplete="off"
        spellCheck={false}
      />
      {incomplete && (
        <p className="mt-1 text-xs text-red-600">
          Use Ghana Post GPS format: 2 letters, 3 digits, 4 digits (e.g. GA-123-4567).
        </p>
      )}
    </div>
  );
}
