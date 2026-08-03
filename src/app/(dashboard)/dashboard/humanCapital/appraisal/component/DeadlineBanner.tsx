"use client";

import { AlertCircle } from "lucide-react";
import { getDeadlineDisplay, type DeadlineDisplay } from "@/lib/appraisal/deadlines";
import type { Quarter } from "@/lib/appraisal/sections";

export function DeadlineBanner({
  reviewQuarter,
  reviewYear,
  status,
  deadlineAt,
  reopenedDeadlineAt,
}: {
  reviewQuarter: Quarter;
  reviewYear: number;
  status?: string | null;
  deadlineAt?: string | null;
  reopenedDeadlineAt?: string | null;
}) {
  const display: DeadlineDisplay | null = getDeadlineDisplay({
    review_quarter: reviewQuarter,
    review_year: reviewYear,
    status,
    deadline_at: deadlineAt,
    reopened_deadline_at: reopenedDeadlineAt,
  });

  if (!display) return null;

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-bold text-red-800">{display.message}</p>
        {display.phase === "reopened" && (
          <p className="text-xs text-red-600 mt-0.5">
            Complete the supervisor evaluation and final review before this date.
          </p>
        )}
        {display.phase === "after_quarter_end" && (
          <p className="text-xs text-red-600 mt-0.5">
            The quarter has ended — complete all required steps before the lock date.
          </p>
        )}
      </div>
    </div>
  );
}
