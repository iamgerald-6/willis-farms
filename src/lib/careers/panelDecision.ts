import type { ApplicationStatus, InterviewFormData, PanelDecision } from "./types";

export type ScoreStanding =
  | "strong_hire"
  | "hire"
  | "hold"
  | "do_not_hire"
  | "incomplete";

export function scoreStanding(total: number | null | undefined): ScoreStanding {
  if (total == null) return "incomplete";
  if (total >= 4.0) return "strong_hire";
  if (total >= 3.3) return "hire";
  if (total >= 2.8) return "hold";
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

/** Hire is only allowed when weighted total is at least 3.3 */
export function canConfirmHire(total: number | null | undefined): boolean {
  return total != null && total >= 3.3;
}

export function observedDisqualifiers(
  formData: InterviewFormData,
  disqualifierLabels: string[],
): { id: string; label: string; notes?: string }[] {
  const entries = formData.disqualifiers ?? {};
  return Object.entries(entries)
    .filter(([, v]) => v.observed === "yes")
    .map(([id, v]) => {
      const index = Number.parseInt(id.replace("dq_", ""), 10);
      return {
        id,
        label: disqualifierLabels[index] ?? id,
        notes: v.notes?.trim() || undefined,
      };
    });
}

export function validatePanelDecision(
  decision: PanelDecision | "" | undefined,
  total: number | null | undefined,
): string | null {
  if (!decision) return "Select a panel decision before confirming.";
  if (decision === "hire" && !canConfirmHire(total)) {
    return "Hire requires a weighted score of at least 3.3.";
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
