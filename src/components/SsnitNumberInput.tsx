"use client";

import {
  formatSsnitNumber,
  isCompleteSsnitNumber,
} from "@/lib/careers/onboardingFormSchema";

const fieldClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

export function SsnitNumberInput({
  value,
  onChange,
  placeholder = "P123456789012",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const formatted = formatSsnitNumber(value);
  const incomplete = formatted.length > 0 && !isCompleteSsnitNumber(formatted);

  return (
    <div>
      <input
        type="text"
        className={fieldClass}
        placeholder={placeholder}
        value={formatted}
        onChange={(e) => onChange(formatSsnitNumber(e.target.value))}
        autoComplete="off"
        spellCheck={false}
      />
      {incomplete && (
        <p className="mt-1 text-xs text-red-600">
          Use the standard SSNIT format: 1 letter followed by 12 digits (e.g. P123456789012).
        </p>
      )}
    </div>
  );
}
