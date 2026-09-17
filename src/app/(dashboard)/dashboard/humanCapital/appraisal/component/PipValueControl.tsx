"use client";

import { ChevronDown } from "lucide-react";
import type { PipControlSpec } from "@/lib/appraisal/pipFormControls";

const BRAND = "#C62828";

export function PipValueControl({
  spec,
  value,
  onChange,
  readOnly,
  compact,
  ariaLabel,
}: {
  spec: PipControlSpec;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  compact?: boolean;
  ariaLabel?: string;
}) {
  const ringStyle = { "--tw-ring-color": BRAND } as React.CSSProperties;
  const pad = compact ? "px-2 py-1.5 text-sm" : "px-3 py-2.5 text-sm";
  const base = `w-full border border-gray-200 rounded-lg ${pad} focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-600`;

  if (readOnly) {
    return (
      <span className={`block text-gray-800 ${compact ? "text-sm" : ""}`}>
        {value || "—"}
      </span>
    );
  }

  if (spec.inputType === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={compact ? 2 : 4}
        aria-label={ariaLabel}
        placeholder={spec.placeholder ?? "Enter details…"}
        className={`${base} resize-y min-h-[72px]`}
        style={ringStyle}
      />
    );
  }

  if (spec.inputType === "date") {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={base}
        style={ringStyle}
      />
    );
  }

  if (spec.inputType === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        placeholder={spec.placeholder ?? "0"}
        className={base}
        style={ringStyle}
      />
    );
  }

  if (spec.inputType === "select" || spec.inputType === "yesno") {
    const options = spec.options ?? [];
    return (
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className={`${base} appearance-none bg-white pr-8`}
          style={ringStyle}
        >
          <option value="">Choose…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    );
  }

  if (spec.inputType === "signature") {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        placeholder={spec.placeholder ?? "Type full name to acknowledge"}
        className={`${base} border-b-2 border-t-0 border-x-0 rounded-none px-0 italic`}
        style={ringStyle}
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      placeholder={spec.placeholder ?? "Enter text…"}
      className={base}
      style={ringStyle}
    />
  );
}
