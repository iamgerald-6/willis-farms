"use client";

// Fixed list instead of free text — keeps every recurring task's frequency
// as a value taskRecurrence.ts actually recognizes (see parseFrequencyInterval
// there), rather than something a typo or unusual phrasing turns into a task
// that silently never auto-renews. "Hourly" is included since it's a value
// Sheila wants selectable, but note it's not a recognized cadence there
// today — due_date is a day-level field, so an hourly task won't auto-renew
// like the others until that's addressed separately.
export const FREQUENCY_OPTIONS = [
  "Hourly",
  "Daily",
  "Weekly",
  "Bi-Weekly",
  "Monthly",
  "Quarterly",
  "Semi-Annually",
  "Annually",
  "Bi-Annually",
] as const;

export default function FrequencySelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none bg-white"}
    >
      <option value="" disabled>
        Frequency…
      </option>
      {FREQUENCY_OPTIONS.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
  );
}
