// Turns the `frequency` value (picked from FrequencySelect.tsx's fixed
// dropdown — Daily, Weekly, Monthly, etc.) into an actual interval, and
// advances a due date by it. Used when a recurring task gets marked
// complete: instead of closing the task, its due date jumps forward to the
// next cycle.
//
// "Hourly" is deliberately NOT recognized here — due_date is a day, not a
// time, so there's no per-hour interval that means anything on it. An
// Hourly task is handled entirely separately in taskManagerData.ts's
// performTaskCompletion (due_date stays put on completion) and the
// close-of-business rollover cron (due_date advances once a day, on its
// own schedule, regardless of completions) — see the comment there.

export interface RecurrenceInterval {
  unit: "day" | "month";
  amount: number;
}

/**
 * Best-effort parse of a recognized frequency value into an interval.
 * Recognizes the fixed set of cadences FrequencySelect.tsx offers, plus an
 * "every N day/week/month/year" fallback for free text from older data or
 * document extraction. Returns null when the text doesn't match anything
 * recognizable (including "Hourly" — see above) — callers should treat that
 * as "can't auto-renew this one" rather than guessing.
 */
export function parseFrequencyInterval(raw: string | null | undefined): RecurrenceInterval | null {
  if (!raw) return null;
  const f = raw.trim().toLowerCase();
  if (!f) return null;

  const everyMatch = f.match(/every\s+(\d+)\s*(day|week|month|year)/);
  if (everyMatch) {
    const n = parseInt(everyMatch[1], 10);
    switch (everyMatch[2]) {
      case "day":
        return { unit: "day", amount: n };
      case "week":
        return { unit: "day", amount: n * 7 };
      case "month":
        return { unit: "month", amount: n };
      case "year":
        return { unit: "month", amount: n * 12 };
    }
  }

  if (/\bdaily\b/.test(f)) return { unit: "day", amount: 1 };
  // .? tolerates "biweekly", "bi-weekly", and "bi weekly" alike — same
  // flexible-separator style already used below for semi/bi-annual.
  if (/\bfortnightly\b|\bbi.?weekly\b/.test(f)) return { unit: "day", amount: 14 };
  if (/\bweekly\b/.test(f)) return { unit: "day", amount: 7 };
  if (/\bbimonthly\b/.test(f)) return { unit: "month", amount: 2 };
  if (/\bmonthly\b/.test(f)) return { unit: "month", amount: 1 };
  if (/\bquarterly\b/.test(f)) return { unit: "month", amount: 3 };
  if (/semi.?annual|bi.?annual|half.?yearly/.test(f)) return { unit: "month", amount: 6 };
  if (/\bbiennial\b|every other year/.test(f)) return { unit: "month", amount: 24 };
  if (/\bannual(ly)?\b|\byearly\b/.test(f)) return { unit: "month", amount: 12 };

  return null;
}

/** "YYYY-MM-DD" + N days, in UTC (matches how the rest of Task Manager treats due_date). */
function addDaysUTC(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * "YYYY-MM-DD" + N months, clamped to the target month's last day rather
 * than rolling into the month after (e.g. Jan 31 + 1 month -> Feb 28/29,
 * not Mar 3) — the more sensible behavior for "due on this date every
 * month/quarter/year".
 */
function addMonthsClamped(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = (m - 1) + months;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12; // 0-indexed, always positive
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDayOfTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, day)).toISOString().slice(0, 10);
}

/**
 * The next due date after `currentDueDate`, advanced by `frequency`'s
 * interval — and kept anchored to the ORIGINAL due date, not to whenever it
 * actually got completed, so a yearly task due every January 1st stays due
 * every January 1st even if one year it's ticked off in December or missed
 * until March. If it's completed very late (more than one interval past
 * due), keeps advancing until the result is genuinely in the future rather
 * than landing the next cycle in the past too.
 *
 * Returns null when `frequency` isn't a recognizable cadence — the caller
 * should fall back to a normal (non-renewing) completion in that case.
 */
export function computeNextDueDate(currentDueDate: string, frequency: string | null | undefined): string | null {
  const interval = parseFrequencyInterval(frequency);
  if (!interval) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  let next = currentDueDate;
  do {
    next = interval.unit === "day" ? addDaysUTC(next, interval.amount) : addMonthsClamped(next, interval.amount);
  } while (next <= todayStr);

  return next;
}
