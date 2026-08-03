import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  computeDeadline,
  isOverdue,
  isPostQuarterNoticeDay,
  preQuarterReminderDueToday,
} from "@/lib/appraisal/deadlines";
import type { Quarter } from "@/lib/appraisal/sections";
import {
  sendAppraisalOpenNotice,
  sendAppraisalReminder,
  sendPostQuarterNotice,
  sendReopenFailureEmail,
  sendSupervisorPenaltyEmail,
} from "@/lib/appraisal/emails";
import {
  lockOverdueAppraisal,
  lockReopenFailure,
} from "@/lib/appraisal/server";
import {
  FIRST_SUPERVISOR_PENALTY,
  SECOND_EMPLOYEE_PENALTY,
  SECOND_SUPERVISOR_PENALTY,
} from "@/lib/appraisal/deadlines";

const GRADE_BAND_FOR_LEVEL: Record<string, string> = {
  L1: "L1",
  L2: "L2_L3",
  L3: "L2_L3",
  L4: "L4",
  L5: "L5_L6_L7",
  L6: "L5_L6_L7",
  L7: "L5_L6_L7",
};

function isQuarterStartDate(now: Date): boolean {
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  return day === 1 && [0, 3, 6, 9].includes(month);
}

function pendingAudience(
  submittedBy: string | null | undefined,
  status: string,
): "employee" | "supervisor" | null {
  if (status === "final_reviewed" || status === "locked") return null;
  if (status === "reopened" || submittedBy === "both") return "supervisor";
  if (!submittedBy || submittedBy === "employee") {
    return submittedBy === "employee" ? "supervisor" : "employee";
  }
  return null;
}

/**
 * Daily cron:
 *   1. Seed open rows at quarter start.
 *   2. Pre-quarter reminders (15/7/1 days before quarter end).
 *   3. Post-quarter one-time notice (first day after quarter end).
 *   4. Lock overdue appraisals (quarter lock date passed).
 *   5. Lock reopened appraisals whose 10-day appeal window expired.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const now = new Date();
  const summary = {
    seeded: 0,
    remindersSent: 0,
    postQuarterNotices: 0,
    locked: 0,
    reopenLocked: 0,
    penalized: 0,
    errors: [] as string[],
  };

  try {
    // ── 1. Seed quarter rows ────────────────────────────────────────────
    if (isQuarterStartDate(now)) {
      const month = now.getUTCMonth();
      const year = now.getUTCFullYear();
      const quarter: Quarter =
        month === 0 ? "Q1" : month === 3 ? "Q2" : month === 6 ? "Q3" : "Q4";

      const { data: allUsers } = await supabaseAdmin.from("users").select("*");
      const { data: existingRows } = await supabaseAdmin
        .from("appraisals")
        .select("company_id")
        .eq("review_quarter", quarter)
        .eq("review_year", year);

      const existingCompanyIds = new Set((existingRows ?? []).map((r) => r.company_id));
      const deadlineAt = computeDeadline(quarter, year).toISOString();

      for (const user of allUsers ?? []) {
        if (!user.company_id || existingCompanyIds.has(user.company_id)) continue;

        const gradeBand = GRADE_BAND_FOR_LEVEL[user.grade_level ?? ""] ?? "L1";
        const { error: insertError } = await supabaseAdmin.from("appraisals").insert({
          company_id: user.company_id,
          employee_name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
          job_title: user.job_position ?? "",
          current_grade: user.grade_level ?? "L1",
          grade_band: gradeBand,
          cycle: quarter === "Q4" ? "annual" : "quarterly",
          review_quarter: quarter,
          review_year: year,
          immediate_supervisor: "Not yet specified",
          promotion_readiness: "not_yet_ready",
          status: "open",
          deadline_at: deadlineAt,
          employee_user_id: user.user_id,
          employee_email: user.email ?? null,
          employee_penalty_points: 0,
          appeal_exhausted: false,
        });

        if (insertError) {
          summary.errors.push(`seed ${user.company_id}: ${insertError.message}`);
          continue;
        }
        summary.seeded++;

        if (user.email) {
          const result = await sendAppraisalOpenNotice({
            employeeEmail: user.email,
            employeeName: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
            quarter,
            year,
            deadlineAt,
          });
          if (!result.sent) summary.errors.push(`open-notice ${user.company_id}: ${result.error}`);
        }
      }
    }

    // ── 2–5. Active appraisals (not final, not locked) ──────────────────
    const { data: activeAppraisals } = await supabaseAdmin
      .from("appraisals")
      .select(
        "id, employee_name, employee_email, supervisor_email, immediate_supervisor, submitted_by, review_quarter, review_year, deadline_at, reopened_deadline_at, supervisor_id, employee_user_id, employee_weighted_score, supervisor_weighted_score, final_quarter_score, employee_penalty_points, status, appeal_exhausted",
      )
      .in("status", ["open", "submitted", "reopened"]);

    for (const appraisal of activeAppraisals ?? []) {
      const quarter = appraisal.review_quarter as Quarter;
      const year = appraisal.review_year as number;
      const lockDate =
        appraisal.status === "reopened" && appraisal.reopened_deadline_at
          ? new Date(appraisal.reopened_deadline_at as string)
          : appraisal.deadline_at
            ? new Date(appraisal.deadline_at as string)
            : computeDeadline(quarter, year);

      // ── Reopen window expired → second lock ───────────────────────────
      if (appraisal.status === "reopened" && isOverdue(lockDate)) {
        const result = await lockReopenFailure(supabaseAdmin, {
          id: appraisal.id,
          submitted_by: appraisal.submitted_by,
          supervisor_id: appraisal.supervisor_id,
          employee_user_id: appraisal.employee_user_id,
          review_quarter: quarter,
          review_year: year,
          employee_weighted_score: appraisal.employee_weighted_score,
          supervisor_weighted_score: appraisal.supervisor_weighted_score,
          final_quarter_score: appraisal.final_quarter_score,
        });
        summary.reopenLocked++;
        if (result.penaltyApplied) summary.penalized++;

        if (appraisal.supervisor_email) {
          await sendReopenFailureEmail({
            toEmail: appraisal.supervisor_email,
            toName: appraisal.immediate_supervisor || "Supervisor",
            audience: "supervisor",
            employeeName: appraisal.employee_name,
            quarter,
            year,
            supervisorPoints: SECOND_SUPERVISOR_PENALTY,
            employeePoints: SECOND_EMPLOYEE_PENALTY,
          });
        }
        if (appraisal.employee_email) {
          await sendReopenFailureEmail({
            toEmail: appraisal.employee_email,
            toName: appraisal.employee_name,
            audience: "employee",
            employeeName: appraisal.employee_name,
            quarter,
            year,
            supervisorPoints: SECOND_SUPERVISOR_PENALTY,
            employeePoints: SECOND_EMPLOYEE_PENALTY,
          });
        }
        continue;
      }

      // ── Quarter lock date passed → first lock ─────────────────────────
      if (appraisal.status !== "reopened" && isOverdue(lockDate)) {
        const result = await lockOverdueAppraisal(supabaseAdmin, {
          id: appraisal.id,
          submitted_by: appraisal.submitted_by,
          supervisor_id: appraisal.supervisor_id,
          employee_user_id: appraisal.employee_user_id,
          review_quarter: quarter,
          review_year: year,
          employee_weighted_score: appraisal.employee_weighted_score,
          supervisor_weighted_score: appraisal.supervisor_weighted_score,
        });
        summary.locked++;
        if (result.penaltyApplied) {
          summary.penalized++;
          if (appraisal.supervisor_email) {
            await sendSupervisorPenaltyEmail({
              supervisorEmail: appraisal.supervisor_email,
              supervisorName: appraisal.immediate_supervisor || "Supervisor",
              employeeName: appraisal.employee_name,
              quarter,
              year,
              pointsDeducted: FIRST_SUPERVISOR_PENALTY,
            });
          }
        }
        continue;
      }

      const audience = pendingAudience(appraisal.submitted_by, appraisal.status);
      if (!audience) continue;

      // ── Pre-quarter reminders (15/7/1 days before quarter end) ────────
      const preReminder = preQuarterReminderDueToday(quarter, year, now);
      if (preReminder !== null) {
        const toEmail =
          audience === "employee" ? appraisal.employee_email : appraisal.supervisor_email;
        if (toEmail) {
          const result = await sendAppraisalReminder({
            toEmail,
            toName:
              audience === "employee"
                ? appraisal.employee_name
                : appraisal.immediate_supervisor || "Supervisor",
            audience,
            quarter,
            year,
            daysLeft: preReminder,
            deadlineAt: lockDate,
            employeeName: appraisal.employee_name,
          });
          if (result.sent) summary.remindersSent++;
        }
        continue;
      }

      // ── Post-quarter one-time notice (day 1 after quarter end) ────────
      if (isPostQuarterNoticeDay(quarter, year, now)) {
        const toEmail =
          audience === "employee" ? appraisal.employee_email : appraisal.supervisor_email;
        if (toEmail) {
          const result = await sendPostQuarterNotice({
            toEmail,
            toName:
              audience === "employee"
                ? appraisal.employee_name
                : appraisal.immediate_supervisor || "Supervisor",
            audience,
            quarter,
            year,
            lockDate,
            employeeName: appraisal.employee_name,
          });
          if (result.sent) summary.postQuarterNotices++;
        }
      }
    }

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    console.error("[GET /api/cron/appraisal-reminders]", err);
    return NextResponse.json(
      { error: "Server error", summary },
      { status: 500 },
    );
  }
}
