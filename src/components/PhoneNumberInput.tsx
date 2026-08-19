"use client";

// Phone field for the public job application form — a country-code
// select plus a digits-only text box capped at 9 digits, combined into
// one "+<code><digits>" string so it still fits the form's existing
// single-string field storage (application_form_data JSON, and the
// top-level `phone` column via extractApplicantSummary in
// applicationFormSchema.ts) without any schema changes elsewhere.
// Format enforcement (code selected + exactly 9 digits) lives in
// validateStep in the same file, so the wizard won't advance past a
// step with an incomplete number.

import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/careers/phoneCountryCodes";

const fieldClass =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

function parseValue(value: string): { code: string; digits: string } {
  const raw = (value ?? "").trim();
  // Longest matching code wins — e.g. "+1684..." (American Samoa) also
  // starts with "+1" (Canada/United States), so matching the first hit
  // in the list would silently downgrade every +1xxx territory to plain
  // +1 the moment a digit is typed.
  const matched = COUNTRY_CODES.filter((c) => raw.startsWith(c.code)).sort(
    (a, b) => b.code.length - a.code.length,
  )[0];
  if (matched) {
    return { code: matched.code, digits: raw.slice(matched.code.length).replace(/\D/g, "").slice(0, 9) };
  }
  return { code: DEFAULT_COUNTRY_CODE, digits: raw.replace(/\D/g, "").slice(0, 9) };
}

export function PhoneNumberInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { code, digits } = parseValue(value);
  const incomplete = digits.length > 0 && digits.length < 9;

  function commit(nextCode: string, nextDigits: string) {
    onChange(`${nextCode}${nextDigits}`);
  }

  return (
    <div>
      <div className="flex gap-2">
        <select
          value={code}
          onChange={(e) => commit(e.target.value, digits)}
          className={`w-32 shrink-0 ${fieldClass}`}
        >
          {COUNTRY_CODES.map((c) => (
            <option key={`${c.code}-${c.country}`} value={c.code}>
              {c.code} {c.country}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          maxLength={9}
          placeholder="9 digit number"
          value={digits}
          onChange={(e) => commit(code, e.target.value.replace(/\D/g, "").slice(0, 9))}
          className={`flex-1 ${fieldClass}`}
        />
      </div>
      {incomplete && (
        <p className="mt-1 text-xs text-red-600">Enter all 9 digits — {digits.length}/9 so far.</p>
      )}
    </div>
  );
}
