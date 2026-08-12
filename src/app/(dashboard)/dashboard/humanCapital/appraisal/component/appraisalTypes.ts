import type { Ratings } from "@/lib/appraisal/scoring";
import type { Quarter } from "@/lib/appraisal/sections";

export type AppraisalStatus =
  | "open"
  | "submitted"
  | "final_reviewed"
  | "locked"
  | "reopened";

export type LockedReason =
  | "employee_incomplete"
  | "supervisor_incomplete"
  | "reopen_incomplete";

export interface Appraisal {
  id: string;
  company_id: string;
  employee_name: string;
  job_title: string;
  current_grade: string;
  grade_band: string;
  cycle?: string | null;
  review_quarter: Quarter;
  review_year: number;
  immediate_supervisor: string;
  supervisor_email?: string | null;
  employee_email?: string | null;
  reviewing_manager?: string | null;
  period_covered?: string | null;
  section_authorisations_held?: string | null;
  employee_ratings?: Ratings | null;
  supervisor_ratings?: Ratings | null;
  employee_weighted_score?: number | null;
  supervisor_weighted_score?: number | null;
  final_quarter_score?: number | null;
  final_review_date?: string | null;
  final_review_notes?: string | null;
  promotion_readiness: string;
  strengths_observed?: string | null;
  improvement_areas?: string | null;
  agreed_actions?: string | null;
  employee_comments?: string | null;
  most_significant_achievement?: string | null;
  development_plan_next_year?: string | null;
  promotion_readiness_assessment?: string | null;
  compensation_review_input?: string | null;
  submitted_by?: "none" | "employee" | "supervisor" | "both";
  status?: AppraisalStatus;
  locked_reason?: LockedReason | null;
  deadline_at?: string | null;
  reopened_deadline_at?: string | null;
  employee_submitted_at?: string | null;
  supervisor_submitted_at?: string | null;
  locked_at?: string | null;
  appeal_exhausted?: boolean;
  employee_penalty_points?: number | null;
  supervisor_id?: string | null;
  employee_user_id?: string | null;
  /** Who actually submitted the supervisor evaluation (not the name the
   *  employee typed into "immediate supervisor"). */
  supervisor_reviewed_by?: string | null;
  supervisor_reviewed_by_name?: string | null;
  /** Who ran the final review meeting and signed the quarter off. */
  final_reviewed_by?: string | null;
  final_reviewed_by_name?: string | null;
  final_reviewed_at?: string | null;
  archived?: boolean;
  archived_at?: string | null;
  archived_by?: string | null;
  archived_by_name?: string | null;
  created_at: string;
}

export interface Justification {
  id: string;
  appraisal_id: string;
  supervisor_id: string;
  reason_text: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by_name?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  points_waived: boolean;
  created_at: string;
}

// Supervisor is derived from grade_level >= L4 (line-supervisor threshold),
// NOT from role. "Full access" (see all employees) is a separate, L5+ concept.
export interface ViewerContext {
  role: "employee" | "manager" | "admin" | "super_admin";
  gradeLevel: string | null;
  companyId?: string;
  userId?: string;
  accessTier?: string | null;
  pagePermissionLevels?: Partial<
    Record<string, "view" | "add" | "edit">
  > | null;
}

export const PROMOTION_LABELS: Record<string, string> = {
  not_yet_ready: "Not Yet Ready",
  developing: "Developing Toward Next Level",
  nearly_ready: "Nearly Ready",
  ready_for_assessment: "Ready for Promotion Assessment",
  ready_for_expanded_responsibility: "Ready for Expanded Responsibility",
};

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function periodLabel(a: Pick<Appraisal, "review_quarter" | "review_year">) {
  return a.review_quarter === "Q4"
    ? `Q4 (Annual) ${a.review_year}`
    : `${a.review_quarter} ${a.review_year}`;
}

/**
 * Who signed this appraisal off. Prefers the person who actually ran the final
 * review, then whoever submitted the supervisor evaluation, and only falls back
 * to the free-text supervisor name the employee typed on their self-assessment.
 */
export function reviewedBy(a: Appraisal): string | null {
  return (
    a.final_reviewed_by_name ||
    a.supervisor_reviewed_by_name ||
    a.immediate_supervisor ||
    null
  );
}

export type StatusTone = "neutral" | "amber" | "blue" | "emerald" | "red" | "purple";

export interface StatusSummary {
  label: string;
  tone: StatusTone;
  /** What the current state means, in plain language. */
  description: string;
  /** What has to happen next, or null when the appraisal is finished. */
  nextStep: string | null;
}

const LOCKED_DESCRIPTIONS: Record<LockedReason, string> = {
  employee_incomplete:
    "The self-assessment deadline passed before the employee submitted.",
  supervisor_incomplete:
    "The supervisor evaluation deadline was missed. A 10-point deduction applies to the supervisor's own appraisal unless an approved justification waives it.",
  reopen_incomplete:
    "The reopened completion window expired without a final review. Penalties have been applied and no further appeals are permitted.",
};

/** Single source of truth for how a status is presented across list and detail. */
export function getStatusSummary(a: {
  status?: string | null;
  submitted_by?: string | null;
  locked_reason?: string | null;
  appeal_exhausted?: boolean;
}): StatusSummary {
  if (a.status === "locked") {
    return {
      label: "Locked",
      tone: "red",
      description:
        LOCKED_DESCRIPTIONS[a.locked_reason as LockedReason] ??
        "This appraisal was locked after its deadline passed.",
      nextStep:
        a.locked_reason === "supervisor_incomplete" && !a.appeal_exhausted
          ? "The supervisor may submit a justification to request that it be reopened."
          : null,
    };
  }

  if (a.status === "reopened") {
    return {
      label: "Reopened",
      tone: "purple",
      description:
        "A justification was approved, so this appraisal was unlocked for a limited period.",
      nextStep:
        "Complete the outstanding evaluation and the final review before the reopened deadline.",
    };
  }

  if (a.status === "final_reviewed") {
    return {
      label: "Final Reviewed",
      tone: "emerald",
      description:
        "The final review meeting is complete and the quarter score is locked in.",
      nextStep: null,
    };
  }

  if (a.submitted_by === "both") {
    return {
      label: "Both Submitted",
      tone: "blue",
      description:
        "Both the employee and the supervisor have submitted their ratings, so all scores are now visible to both parties.",
      nextStep:
        "Hold the final review meeting to agree and lock in the final quarter score.",
    };
  }

  if (a.submitted_by === "supervisor") {
    return {
      label: "Supervisor Submitted",
      tone: "blue",
      description:
        "The supervisor has submitted their evaluation. The employee's self-assessment is still outstanding.",
      nextStep: "The employee needs to complete their self-assessment.",
    };
  }

  if (a.submitted_by === "employee") {
    return {
      label: "Awaiting Supervisor",
      tone: "amber",
      description:
        "The employee has submitted their self-assessment. It stays hidden from the supervisor until the supervisor submits their own evaluation.",
      nextStep: "The supervisor needs to complete their evaluation.",
    };
  }

  return {
    label: "Not Started",
    tone: "neutral",
    description: "Neither party has submitted their ratings yet.",
    nextStep: "The employee starts by completing their self-assessment.",
  };
}
