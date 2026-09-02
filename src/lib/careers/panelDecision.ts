import type { ApplicationStatus, InterviewFormData, PanelDecision } from "./types";
import {
  DEFAULT_INTERVIEW_BENCHMARKS,
  type ResolvedInterviewBenchmarks,
} from "@/lib/systemDefinitions/interviewBenchmarksConfig";

export type ScoreStanding =
  | "strong_hire"
  | "hire"
  | "hold"
  | "do_not_hire"
  | "incomplete";

export function scoreStanding(
  total: number | null | undefined,
  benchmarks: ResolvedInterviewBenchmarks = DEFAULT_INTERVIEW_BENCHMARKS,
): ScoreStanding {
  if (total == null) return "incomplete";
  if (total >= benchmarks.strongHireMin) return "strong_hire";
  if (total >= benchmarks.hireMin) return "hire";
  if (total >= benchmarks.holdMin) return "hold";
  return "do_not_hire";
}

export function standingLabel(standing: ScoreStanding): string {
  switch (standing) {
    case "strong_hire":
      return "Strong hire / appoint";
    case "hire":
      return "Hire / appoint (confirm references)";
    case "hold":
      return "Hold / reserve";
    case "do_not_hire":
      return "Do not hire / appoint";
    default:
      return "Incomplete";
  }
}

/** Hire is only allowed when weighted total meets the configured hire minimum. */
export function canConfirmHire(
  total: number | null | undefined,
  benchmarks: ResolvedInterviewBenchmarks = DEFAULT_INTERVIEW_BENCHMARKS,
): boolean {
  return total != null && total >= benchmarks.hireMin;
}

export function observedDisqualifiers(
  formData: InterviewFormData,
  disqualifierLabels: string[],
  disqualifierItems?: { id: string; label: string }[],
): { id: string; label: string; notes?: string }[] {
  const entries = formData.disqualifiers ?? {};
  const labelById = new Map<string, string>();
  if (disqualifierItems?.length) {
    for (const item of disqualifierItems) {
      labelById.set(item.id, item.label);
    }
  } else {
    disqualifierLabels.forEach((label, i) => {
      labelById.set(`dq_${i}`, label);
    });
  }

  return Object.entries(entries)
    .filter(([, v]) => v.observed === "yes")
    .map(([id, v]) => ({
      id,
      label: labelById.get(id) ?? disqualifierLabels[Number.parseInt(id.replace("dq_", ""), 10)] ?? id,
      notes: v.notes?.trim() || undefined,
    }));
}

export function validatePanelDecision(
  decision: PanelDecision | "" | undefined,
  total: number | null | undefined,
  benchmarks: ResolvedInterviewBenchmarks = DEFAULT_INTERVIEW_BENCHMARKS,
): string | null {
  if (!decision) return "Select a panel decision before confirming.";
  if (decision === "hire" && !canConfirmHire(total, benchmarks)) {
    return `Hire requires a weighted score of at least ${benchmarks.hireMin}.`;
  }
  return null;
}

export function statusForDecision(decision: PanelDecision): ApplicationStatus {
  switch (decision) {
    case "hire":
      return "offer";
    case "hold":
      return "hold";
    case "do_not_hire":
      return "rejected";
  }
}
