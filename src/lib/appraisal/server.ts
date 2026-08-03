import type { SupabaseClient } from "@supabase/supabase-js";
import { computeFinalScore, isPromotionEligible } from "./scoring";
import {
  FIRST_SUPERVISOR_PENALTY,
  SECOND_EMPLOYEE_PENALTY,
  SECOND_SUPERVISOR_PENALTY,
} from "./deadlines";
import type { Quarter } from "./sections";
import { QUARTERS } from "./sections";

export type LockedReason =
  | "employee_incomplete"
  | "supervisor_incomplete"
  | "reopen_incomplete";

export interface AppraisalLockContext {
  id: string | number;
  submitted_by?: string | null;
  supervisor_id?: string | null;
  employee_user_id?: string | null;
  review_quarter: Quarter;
  review_year: number;
  employee_weighted_score?: number | null;
  supervisor_weighted_score?: number | null;
  final_quarter_score?: number | null;
  employee_penalty_points?: number | null;
}

/**
 * Recomputes an employee's Final Score = (Q1+Q2+Q3+Q4)/4 and their
 * promotion_eligible flag, then writes both to `users`.
 */
export async function recomputeFinalScore(
  supabase: SupabaseClient,
  employeeUserId: string,
  year: number,
): Promise<{ finalScore: number | null; promotionEligible: boolean }> {
  const { data: appraisals } = await supabase
    .from("appraisals")
    .select(
      "review_quarter, final_quarter_score, employee_weighted_score, supervisor_weighted_score, employee_penalty_points, status",
    )
    .eq("employee_user_id", employeeUserId)
    .eq("review_year", year);

  const byQuarter: Record<string, number | null> = {};
  for (const row of appraisals ?? []) {
    const q = row.review_quarter as string;
    const base =
      row.final_quarter_score ??
      row.supervisor_weighted_score ??
      row.employee_weighted_score ??
      null;
    const penalty = row.employee_penalty_points ?? 0;
    byQuarter[q] =
      base != null ? Math.max(0, Math.round((base - penalty) * 100) / 100) : null;
  }

  const { data: penalties } = await supabase
    .from("supervisor_penalties")
    .select("review_quarter, points_deducted, waived")
    .eq("supervisor_id", employeeUserId)
    .eq("review_year", year)
    .eq("waived", false);

  for (const p of penalties ?? []) {
    const q = p.review_quarter as string;
    if (byQuarter[q] != null) {
      byQuarter[q] = Math.max(0, (byQuarter[q] as number) - p.points_deducted);
    }
  }

  const quarterScores = QUARTERS.map((q) => byQuarter[q] ?? null);
  const finalScore = computeFinalScore(quarterScores);
  const promotionEligible = isPromotionEligible(finalScore);

  await supabase
    .from("users")
    .update({
      final_score: finalScore,
      final_score_year: year,
      promotion_eligible: promotionEligible,
    })
    .eq("user_id", employeeUserId);

  return { finalScore, promotionEligible };
}

function resolveLockedReason(submittedBy?: string | null): LockedReason {
  const employeeDone = submittedBy === "employee" || submittedBy === "both";
  if (!employeeDone) return "employee_incomplete";
  // Employee submitted but supervisor eval and/or final review incomplete.
  return "supervisor_incomplete";
}

function resolveFallbackQuarterScore(appraisal: AppraisalLockContext): number | null {
  if (appraisal.submitted_by === "employee") {
    return appraisal.employee_weighted_score ?? null;
  }
  if (appraisal.submitted_by === "both") {
    return (
      appraisal.supervisor_weighted_score ??
      appraisal.employee_weighted_score ??
      null
    );
  }
  return null;
}

async function insertSupervisorPenalty(
  supabase: SupabaseClient,
  params: {
    supervisor_id: string;
    appraisal_id: string | number;
    review_quarter: Quarter;
    review_year: number;
    points_deducted: number;
    waived?: boolean;
    justification_id?: string | null;
  },
): Promise<boolean> {
  const { error } = await supabase.from("supervisor_penalties").insert({
    supervisor_id: params.supervisor_id,
    appraisal_id: params.appraisal_id,
    review_quarter: params.review_quarter,
    review_year: params.review_year,
    points_deducted: params.points_deducted,
    waived: params.waived ?? false,
    justification_id: params.justification_id ?? null,
  });
  return !error;
}

/**
 * First lock — quarter lock date passed without reaching final_reviewed.
 * Supervisor miss: employee score stands, supervisor −10 (appealable once).
 * Employee miss: no supervisor penalty.
 */
export async function lockOverdueAppraisal(
  supabase: SupabaseClient,
  appraisal: AppraisalLockContext,
): Promise<{ lockedReason: LockedReason; penaltyApplied: boolean; finalQuarterScore: number | null }> {
  const lockedReason = resolveLockedReason(appraisal.submitted_by);
  const finalQuarterScore = resolveFallbackQuarterScore(appraisal);

  await supabase
    .from("appraisals")
    .update({
      status: "locked",
      locked_at: new Date().toISOString(),
      locked_reason: lockedReason,
      final_quarter_score: finalQuarterScore,
      employee_penalty_points: 0,
    })
    .eq("id", appraisal.id);

  let penaltyApplied = false;
  if (lockedReason === "supervisor_incomplete" && appraisal.supervisor_id) {
    penaltyApplied = await insertSupervisorPenalty(supabase, {
      supervisor_id: appraisal.supervisor_id,
      appraisal_id: appraisal.id,
      review_quarter: appraisal.review_quarter,
      review_year: appraisal.review_year,
      points_deducted: FIRST_SUPERVISOR_PENALTY,
    });
  }

  if (appraisal.review_quarter === "Q4" && appraisal.employee_user_id && finalQuarterScore != null) {
    try {
      await recomputeFinalScore(supabase, appraisal.employee_user_id, appraisal.review_year);
    } catch (e) {
      console.error("[lockOverdueAppraisal] recomputeFinalScore failed", e);
    }
  }

  return { lockedReason, penaltyApplied, finalQuarterScore };
}

/**
 * Second lock — reopened appeal window expired without final_reviewed.
 * Supervisor −15 on own appraisal, employee −5 on this quarter. No further appeals.
 */
export async function lockReopenFailure(
  supabase: SupabaseClient,
  appraisal: AppraisalLockContext,
): Promise<{ penaltyApplied: boolean; employeePenaltyApplied: boolean }> {
  const baseScore =
    appraisal.final_quarter_score ??
    resolveFallbackQuarterScore(appraisal) ??
    appraisal.employee_weighted_score ??
    null;

  await supabase
    .from("appraisals")
    .update({
      status: "locked",
      locked_at: new Date().toISOString(),
      locked_reason: "reopen_incomplete",
      final_quarter_score: baseScore,
      employee_penalty_points: SECOND_EMPLOYEE_PENALTY,
      appeal_exhausted: true,
      reopened_deadline_at: null,
    })
    .eq("id", appraisal.id);

  let penaltyApplied = false;
  if (appraisal.supervisor_id) {
    penaltyApplied = await insertSupervisorPenalty(supabase, {
      supervisor_id: appraisal.supervisor_id,
      appraisal_id: appraisal.id,
      review_quarter: appraisal.review_quarter,
      review_year: appraisal.review_year,
      points_deducted: SECOND_SUPERVISOR_PENALTY,
    });
  }

  if (appraisal.review_quarter === "Q4" && appraisal.employee_user_id) {
    try {
      await recomputeFinalScore(supabase, appraisal.employee_user_id, appraisal.review_year);
    } catch (e) {
      console.error("[lockReopenFailure] recomputeFinalScore failed", e);
    }
  }

  return { penaltyApplied, employeePenaltyApplied: true };
}
