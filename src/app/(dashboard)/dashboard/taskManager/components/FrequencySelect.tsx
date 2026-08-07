"use client";

// Fixed list instead of free text — keeps every recurring task's frequency
// as a value the app actually knows how to handle, rather than something a
// typo or unusual phrasing turns into a task that silently never auto-
// renews. Every option here recurs on completion; "Hourly" works
// differently from the rest (due_date is a day, not a time) — completing it
// resets progress but leaves due_date on today, and due_date only ever
// moves forward via the separate close-of-business rollover cron (see
// src/lib/taskHourlyRollover.ts and taskManagerData.ts's
// performTaskCompletion), not through taskRecurrence.ts like the others.
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
