// The earliest date selectable for a task's start_date or due_date, across
// every date picker in Task Manager (new task, editing a task, and the
// document-extraction review screen) — one year back from today. This is a
// picker constraint, not a data constraint: a task already saved with an
// older date (e.g. legacy/imported data) is untouched, this only limits
// what can be newly typed or picked going forward.
export function minTaskDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
