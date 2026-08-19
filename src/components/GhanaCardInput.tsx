"use client";

// Ghana Card field for the public job application form — a fixed "GHA-"
// prefix the applicant can't edit or delete, followed by a digits-only
// box that auto-inserts the dash after the 9th digit, producing
// "GHA-XXXXXXXXX-X" (9 digits + 1 check digit) as a single stored
// string. Format enforcement lives in validateStep in
// applicationFormSchema.ts, so the wizard won't advance past a step
// with an incomplete number.

function formatBody(digits: string): string {
  if (digits.length <= 9) return digits;
  return `${digits.slice(0, 9)}-${digits.slice(9)}`;
}

function digitsFromValue(value: string): string {
  return (value ?? "").replace(/^GHA-?/, "").replace(/\D/g, "").slice(0, 10);
}

export function GhanaCardInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const digits = digitsFromValue(value);
  const incomplete = digits.length > 0 && digits.length < 10;

  return (
    <div>
      <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-500/30">
        <span className="select-none border-r border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-500">
          GHA-
        </span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="XXXXXXXXX-X"
          value={formatBody(digits)}
          onChange={(e) => {
            const nextDigits = e.target.value.replace(/\D/g, "").slice(0, 10);
            onChange(nextDigits ? `GHA-${formatBody(nextDigits)}` : "");
          }}
          className="flex-1 px-3 py-2 text-sm focus:outline-none"
        />
      </div>
      {incomplete && (
        <p className="mt-1 text-xs text-red-600">
          Enter all 10 digits (9 digits + 1 check digit) — {digits.length}/10 so far.
        </p>
      )}
    </div>
  );
}
