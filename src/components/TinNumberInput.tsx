"use client";

import {
  formatTinNumber,
  isCompleteTinNumber,
} from "@/lib/careers/onboardingFormSchema";

const fieldClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

export function TinNumberInput({
  value,
  onChange,
  placeholder = "P1234567890",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const formatted = formatTinNumber(value);
  const incomplete = formatted.length > 0 && !isCompleteTinNumber(formatted);

  return (
    <div>
      <input
        type="text"
        className={fieldClass}
        placeholder={placeholder}
        value={formatted}
        onChange={(e) => onChange(formatTinNumber(e.target.value))}
        autoComplete="off"
        spellCheck={false}
      />
      {incomplete && (
        <p className="mt-1 text-xs text-red-600">
          Use the standard Ghana TIN format: 1 letter (C, G, P, Q, or V) followed by 10 digits (e.g. P1234567890).
        </p>
      )}
    </div>
  );
}
