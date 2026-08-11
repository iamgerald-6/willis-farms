// Small, framework-agnostic constants shared between Task Manager's UI and
// its API routes — kept in a plain .ts file (no "use client", no React
// import) specifically so a server route (e.g. extract/route.ts) can import
// from here without pulling a client component into the server bundle.

// Every recognized recurring-task cadence. This is the single list the
// frequency dropdown (FrequencySelect.tsx, which re-exports this) and the
// AI document-extraction prompt (extract/route.ts) both read from, so
// adding/removing an option only ever needs to happen in one place — Claude
// can no longer propose a frequency the dropdown doesn't actually offer.
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

// Weekday names — shared by the recurring "off days" picker
// (OffDaySelector.tsx) and the full calendar page (calendar/page.tsx),
// which used to each type out their own identical copy of these two lists.
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Task Manager's brand red, used for the same small set of accents
// (selected day pills, links, small headers) in both OffDaySelector.tsx and
// calendar/page.tsx — previously the same hex value typed out by hand in
// both places.
export const TASK_MANAGER_BRAND_COLOR = "#C62828";

// Cycled by project index so a given project's color is consistent
// wherever it shows up — CalendarView.tsx's dots/chips and the full
// calendar page's task chips both read from this one list now, instead of
// calendar/page.tsx keeping its own separate hand-typed subset of it (the
// old comment there literally said "same palette the old task-only
// calendar used").
export const PROJECT_COLOR_PALETTE = [
  { dot: "bg-red-500", chipBg: "bg-red-50", chipText: "text-red-700" },
  { dot: "bg-blue-500", chipBg: "bg-blue-50", chipText: "text-blue-700" },
  { dot: "bg-green-500", chipBg: "bg-green-50", chipText: "text-green-700" },
  { dot: "bg-amber-500", chipBg: "bg-amber-50", chipText: "text-amber-700" },
  { dot: "bg-purple-500", chipBg: "bg-purple-50", chipText: "text-purple-700" },
  { dot: "bg-teal-500", chipBg: "bg-teal-50", chipText: "text-teal-700" },
] as const;

// The main task table's column layout — checkbox, Task/Indicator, Owner,
// Start Date, Due/Next Due, Status, actions. Shared by the desktop header
// (TaskListView.tsx) and every desktop row that has to line up under it
// (TaskRow.tsx's display row and edit-mode row, NewTaskRow.tsx) — one
// definition instead of four hand-typed copies, so the header and the rows
// can't quietly drift out of alignment the way the subtask table's columns
// once did (see SUBTASK_GRID_COLS in SubtaskPanel.tsx for the same idea).
export const TASK_TABLE_GRID_COLS = "grid-cols-[2.5rem_1fr_1fr_1fr_1fr_1fr_auto]";
