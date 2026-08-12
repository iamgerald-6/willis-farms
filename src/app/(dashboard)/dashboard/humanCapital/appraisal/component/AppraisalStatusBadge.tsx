"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { getStatusSummary, type StatusTone } from "./appraisalTypes";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-gray-100 text-gray-500 border border-gray-200",
  amber: "bg-amber-50 text-amber-700 border border-amber-200",
  blue: "bg-blue-50 text-blue-700 border border-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  red: "bg-red-50 text-red-700 border border-red-200",
  purple: "bg-purple-50 text-purple-700 border border-purple-200",
};

const TONE_ICONS: Record<StatusTone, typeof Clock> = {
  neutral: Clock,
  amber: Clock,
  blue: CheckCircle2,
  emerald: ShieldCheck,
  red: Lock,
  purple: AlertTriangle,
};

export function StatusBadge({
  status,
  submittedBy,
  lockedReason,
}: {
  status?: string;
  submittedBy?: string;
  lockedReason?: string | null;
}) {
  const summary = getStatusSummary({
    status,
    submitted_by: submittedBy,
    locked_reason: lockedReason,
  });
  const Icon = TONE_ICONS[summary.tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold ${TONE_CLASSES[summary.tone]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {summary.label}
    </span>
  );
}

export { TONE_CLASSES as STATUS_TONE_CLASSES };
