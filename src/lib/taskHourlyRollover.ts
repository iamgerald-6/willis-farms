import { supabaseAdmin } from "@/lib/taskManagerAuth";

// Ghana (Africa/Accra) has no daylight saving and sits at UTC+0 year-round,
// so plain UTC dates/hours here already line up with the farm's wall clock
// — no timezone conversion needed anywhere in this file.

function isWeekendUTC(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

function addDaysUTC(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The next weekday after `dateStr` — Friday -> Monday, any other day -> the day after. */
function nextBusinessDay(dateStr: string): string {
  let next = addDaysUTC(dateStr, 1);
  while (isWeekendUTC(next)) next = addDaysUTC(next, 1);
  return next;
}

/**
 * Close-of-business rollover for Hourly-frequency recurring tasks — run
 * once a day, weekdays only, by /api/task-manager/cron/hourly-rollover
 * (5pm Accra time, see vercel.json).
 *
 * An Hourly task's due_date is meant to always read as "today" (so it
 * doesn't show as Overdue) for as long as today is still the working day
 * — ticking it complete during the day just resets progress and leaves
 * due_date untouched (see performTaskCompletion in taskManagerData.ts).
 * This is the ONLY thing that ever advances an Hourly task's due_date: at
 * close of business, every active Hourly task whose due_date has fallen
 * behind today gets bumped to the next weekday — Friday's run jumps
 * straight to Monday, skipping the weekend entirely, so nothing sits there
 * reading as Overdue on a Saturday it was never meant to be touched.
 *
 * Deliberately does NOT touch progress_percent or write an audit log entry
 * — this is routine date bookkeeping, not something a person did, and
 * progress is already at 0 for any task that wasn't ticked since its own
 * last cycle.
 */
export async function rollHourlyTaskDates(): Promise<{ updated: number; targetDueDate: string; error?: string }> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const targetDueDate = nextBusinessDay(todayStr);

  const { data, error } = await supabaseAdmin
    .from("tm_tasks")
    .update({ due_date: targetDueDate, updated_at: new Date().toISOString() })
    .eq("is_recurring", true)
    .eq("lifecycle_status", "active")
    .ilike("frequency", "hourly")
    .lte("due_date", todayStr)
    .select("id");

  if (error) {
    console.error("[rollHourlyTaskDates]", error);
    return { updated: 0, targetDueDate, error: error.message };
  }

  return { updated: (data ?? []).length, targetDueDate };
}
