"use client";

// A digital time control styled after iOS's "set alarm" field — a boxed
// HH : MM readout where the hour and minute are typed directly, and
// AM/PM is picked from a small toggle rather than typed. Value in/out is
// 24-hour "HH:mm" to match how the rest of the app stores times.

import { useState } from "react";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function IOSTimePicker({
  value,
  onChange,
  disabled = false,
}: {
  /** 24-hour "HH:mm", e.g. "14:30". Empty string defaults to 09:00. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [hRaw, mRaw] = value ? value.split(":") : ["09", "00"];
  const initialH24 = Number(hRaw) || 0;
  const initialMinute = Number(mRaw) || 0;
  const initialHour12 = initialH24 % 12 === 0 ? 12 : initialH24 % 12;
  const initialPeriod: "AM" | "PM" = initialH24 >= 12 ? "PM" : "AM";

  const [hourText, setHourText] = useState(String(initialHour12).padStart(2, "0"));
  const [minuteText, setMinuteText] = useState(String(initialMinute).padStart(2, "0"));
  const [period, setPeriod] = useState<"AM" | "PM">(initialPeriod);

  function commit(nextHourText: string, nextMinuteText: string, nextPeriod: "AM" | "PM") {
    const hour12 = clamp(Number(nextHourText) || 12, 1, 12);
    const minute = clamp(Number(nextMinuteText) || 0, 0, 59);
    let hour24 = hour12 % 12;
    if (nextPeriod === "PM") hour24 += 12;
    onChange(`${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }

  return (
    <div
      className={`inline-flex h-10 w-40 items-center gap-3 rounded-lg border border-gray-200 px-2.5 text-sm ${disabled ? "opacity-60 bg-gray-50" : ""}`}
    >
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={hourText}
        disabled={disabled}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          setHourText(digits);
          if (digits) commit(digits, minuteText, period);
        }}
        onBlur={() => {
          const padded = String(clamp(Number(hourText) || 12, 1, 12)).padStart(2, "0");
          setHourText(padded);
          commit(padded, minuteText, period);
        }}
        className="w-5 rounded bg-transparent text-center text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed"
      />
      <span className="font-semibold text-gray-300">:</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={minuteText}
        disabled={disabled}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          setMinuteText(digits);
          if (digits) commit(hourText, digits, period);
        }}
        onBlur={() => {
          const padded = String(clamp(Number(minuteText) || 0, 0, 59)).padStart(2, "0");
          setMinuteText(padded);
          commit(hourText, padded, period);
        }}
        className="w-5 rounded bg-transparent text-center text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed"
      />

      <select
        value={period}
        disabled={disabled}
        onChange={(e) => {
          const p = e.target.value as "AM" | "PM";
          setPeriod(p);
          commit(hourText, minuteText, p);
        }}
        className="h-6 rounded border border-gray-200 bg-white px-1 text-xs font-semibold leading-none text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
