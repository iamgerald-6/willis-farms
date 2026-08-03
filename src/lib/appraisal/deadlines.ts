import type { Quarter } from "./sections";

/**
 * Appraisal deadline calendar (all dates UTC):
 *
 *   • Reminders at 15, 7, and 1 day(s) BEFORE quarter end.
 *   • One notice on the first day AFTER quarter end (grace days remain).
 *   • Lock = quarter end + grace days (Q1–Q3: 10 days; Q4 annual: 20 days).
 *   • After an approved appeal: 10 days from approval to reach final_reviewed.
 */

/** Grace after quarter end for Q1, Q2, Q3 (lock date). */
export const GRACE_DAYS_AFTER_QUARTER_END = 10;

/** Grace after quarter end for Q4 annual appraisal (lock date). */
export const GRACE_DAYS_ANNUAL_AFTER_QUARTER_END = 20;

export function graceDaysAfterQuarterEnd(quarter: Quarter): number {
  return quarter === "Q4"
    ? GRACE_DAYS_ANNUAL_AFTER_QUARTER_END
    : GRACE_DAYS_AFTER_QUARTER_END;
}
export const REOPEN_COMPLETION_DAYS = 10;
export const REMINDER_DAYS_BEFORE_QUARTER_END = [15, 7, 1] as const;

export const FIRST_SUPERVISOR_PENALTY = 10;
export const SECOND_SUPERVISOR_PENALTY = 15;
export const SECOND_EMPLOYEE_PENALTY = 5;

/** @deprecated use GRACE_DAYS_AFTER_QUARTER_END */
export const DEADLINE_DAYS_AFTER_QUARTER_END = GRACE_DAYS_AFTER_QUARTER_END;

const QUARTER_END_MONTH_DAY: Record<Quarter, [number, number]> = {
  Q1: [2, 31],
  Q2: [5, 30],
  Q3: [8, 30],
  Q4: [11, 31],
};

/** End of the quarter (23:59:59 UTC on the last calendar day). */
export function quarterEndDate(quarter: Quarter, year: number): Date {
  const [month, day] = QUARTER_END_MONTH_DAY[quarter];
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
}

/** Lock date = quarter end + grace days (end of that UTC day). */
export function computeLockDate(quarter: Quarter, year: number): Date {
  const end = quarterEndDate(quarter, year);
  const lock = new Date(end);
  lock.setUTCDate(lock.getUTCDate() + graceDaysAfterQuarterEnd(quarter));
  lock.setUTCHours(23, 59, 59, 999);
  return lock;
}

/** Alias kept for existing callers storing `deadline_at`. */
export function computeDeadline(quarter: Quarter, year: number): Date {
  return computeLockDate(quarter, year);
}

/** Reopen window ends 10 days after appeal approval. */
export function computeReopenDeadline(approvedAt: string | Date): Date {
  const start = typeof approvedAt === "string" ? new Date(approvedAt) : approvedAt;
  const deadline = new Date(start);
  deadline.setUTCDate(deadline.getUTCDate() + REOPEN_COMPLETION_DAYS);
  deadline.setUTCHours(23, 59, 59, 999);
  return deadline;
}

export function daysBetween(a: Date, b: Date): number {
  const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

export function isOverdue(deadlineAt: string | Date | null | undefined): boolean {
  if (!deadlineAt) return false;
  const deadline = typeof deadlineAt === "string" ? new Date(deadlineAt) : deadlineAt;
  return Date.now() > deadline.getTime();
}

/** Days from `now` until quarter end (negative once the quarter has ended). */
export function daysUntilQuarterEnd(
  quarter: Quarter,
  year: number,
  now: Date = new Date(),
): number {
  return daysBetween(now, quarterEndDate(quarter, year));
}

/** Days from `now` until lock (negative once locked). */
export function daysUntilLock(
  quarter: Quarter,
  year: number,
  now: Date = new Date(),
): number {
  return daysBetween(now, computeLockDate(quarter, year));
}

/**
 * Pre-quarter reminder due today? Returns 15, 7, or 1 if today matches,
 * otherwise null. Only applies while the quarter is still open.
 */
export function preQuarterReminderDueToday(
  quarter: Quarter,
  year: number,
  now: Date = new Date(),
): (typeof REMINDER_DAYS_BEFORE_QUARTER_END)[number] | null {
  const daysLeft = daysUntilQuarterEnd(quarter, year, now);
  if (daysLeft < 0) return null;
  return REMINDER_DAYS_BEFORE_QUARTER_END.includes(
    daysLeft as (typeof REMINDER_DAYS_BEFORE_QUARTER_END)[number],
  )
    ? (daysLeft as (typeof REMINDER_DAYS_BEFORE_QUARTER_END)[number])
    : null;
}

/** True on the first calendar day after quarter end (one-time post-quarter notice). */
export function isPostQuarterNoticeDay(
  quarter: Quarter,
  year: number,
  now: Date = new Date(),
): boolean {
  return daysBetween(quarterEndDate(quarter, year), now) === 1;
}

export function currentQuarterAndYear(now: Date = new Date()): {
  quarter: Quarter;
  year: number;
} {
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  if (month <= 2) return { quarter: "Q1", year };
  if (month <= 5) return { quarter: "Q2", year };
  if (month <= 8) return { quarter: "Q3", year };
  return { quarter: "Q4", year };
}

export type DeadlinePhase = "before_quarter_end" | "after_quarter_end" | "reopened";

export interface DeadlineDisplay {
  daysLeft: number;
  lockDate: Date;
  phase: DeadlinePhase;
  /** Red banner copy — never uses the word "grace period". */
  message: string;
}

/**
 * UI + client countdown for a pending appraisal. Returns null when locked
 * or already final_reviewed.
 */
export function getDeadlineDisplay(input: {
  review_quarter: Quarter;
  review_year: number;
  status?: string | null;
  deadline_at?: string | null;
  reopened_deadline_at?: string | null;
}): DeadlineDisplay | null {
  if (input.status === "locked" || input.status === "final_reviewed") return null;

  const now = new Date();

  if (input.status === "reopened" && input.reopened_deadline_at) {
    const lockDate = new Date(input.reopened_deadline_at);
    const daysLeft = daysBetween(now, lockDate);
    return {
      daysLeft: Math.max(0, daysLeft),
      lockDate,
      phase: "reopened",
      message:
        daysLeft <= 0
          ? `Overdue — was due ${formatDeadlineDate(lockDate)}`
          : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left — due ${formatDeadlineDate(lockDate)}`,
    };
  }

  const lockDate = input.deadline_at
    ? new Date(input.deadline_at)
    : computeLockDate(input.review_quarter, input.review_year);

  const daysLeft = daysBetween(now, lockDate);
  const pastQuarterEnd = daysUntilQuarterEnd(input.review_quarter, input.review_year, now) < 0;

  return {
    daysLeft: Math.max(0, daysLeft),
    lockDate,
    phase: pastQuarterEnd ? "after_quarter_end" : "before_quarter_end",
    message:
      daysLeft <= 0
        ? `Overdue — locks ${formatDeadlineDate(lockDate)}`
        : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left — locks ${formatDeadlineDate(lockDate)}`,
  };
}

export function formatDeadlineDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
