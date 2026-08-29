"use client";

// Phone field for the public job application form — a country-code
// select plus a digits-only text box, combined into one "+<code><digits>"
// string so it still fits the form's existing single-string field storage
// (application_form_data JSON, and the top-level `phone` column via
// extractApplicantSummary in applicationFormSchema.ts) without any schema
// changes elsewhere.
//
// Format enforcement used to be a flat "exactly 9 digits" rule applied to
// every country (Ghana's format, applied universally — wrong for
// everywhere else). It now validates against the real format for
// whichever country is selected, via libphonenumber-js — which parses a
// full "+<code><digits>" string and knows the correct length/pattern for
// that calling code without needing a separate ISO country field on
// COUNTRY_CODES. The hard submit-blocking check lives in validateStep in
// applicationFormSchema.ts; this component's inline hint is just live
// feedback as the applicant types.

import { isValidPhoneNumber } from "libphonenumber-js";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/careers/phoneCountryCodes";

const fieldClass =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

// No country's national number runs longer than 14 digits (E.164's own
// 15-digit total cap, minus at least 1 digit for the calling code) — a
// generous ceiling so typing is never blocked by length before
// libphonenumber-js gets a chance to say whether the number is actually
// valid for the selected country.
const MAX_NATIONAL_DIGITS = 14;

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
    return {
      code: matched.code,
      digits: raw.slice(matched.code.length).replace(/\D/g, "").slice(0, MAX_NATIONAL_DIGITS),
    };
  }
  return { code: DEFAULT_COUNTRY_CODE, digits: raw.replace(/\D/g, "").slice(0, MAX_NATIONAL_DIGITS) };
}

export function PhoneNumberInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { code, digits } = parseValue(value);
  // Only judge once there's a plausible amount typed — flagging "invalid"
  // after one or two digits would just be noise, since almost every
  // partial number looks invalid until it's finished.
  const showInvalidHint = digits.length >= 5 && !isValidPhoneNumber(`${code}${digits}`);

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
          maxLength={MAX_NATIONAL_DIGITS}
          placeholder="Phone number"
          value={digits}
          onChange={(e) => commit(code, e.target.value.replace(/\D/g, "").slice(0, MAX_NATIONAL_DIGITS))}
          className={`flex-1 ${fieldClass}`}
        />
      </div>
      {showInvalidHint && (
        <p className="mt-1 text-xs text-red-600">
          That doesn&apos;t look like a valid phone number for the selected country.
        </p>
      )}
    </div>
  );
}
