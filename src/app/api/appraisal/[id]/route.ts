import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { recomputeFinalScore } from "@/lib/appraisal/server";
import { canRate } from "@/lib/appraisal/sections";
import { sendSupervisorEvaluationDueEmail, logSupervisorEvaluationEmail } from "@/lib/appraisal/emails";
import { getActiveAppraisalPeriod } from "@/lib/appraisal/deadlines";
import { canViewAllAppraisalPeriods, isSuperAdmin } from "@/lib/accessControl";
import {
  requireAuth,
  canAccessAppraisalRecord,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireAuth(req);
  if (!caller) return jsonUnauthorized();

  if (!id) {
    return NextResponse.json(
      { error: "Appraisal ID is required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("appraisals")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Appraisal not found" }, { status: 404 });
  }

  if (!canAccessAppraisalRecord(caller, data)) {
    return jsonForbidden("You do not have access to this appraisal.");
  }

  // Employees may only open the current applicable period (or a record that
  // is still mid-workflow). Past closed periods are Manager/Admin only.
  if (!canViewAllAppraisalPeriods(caller.role)) {
    const active = getActiveAppraisalPeriod();
    const isActivePeriod =
      data.review_quarter === active.quarter &&
      Number(data.review_year) === active.year;
    const stillInProgress = ["open", "submitted", "reopened"].includes(
      data.status ?? "",
    );
    if (!isActivePeriod && !stillInProgress) {
      return jsonForbidden(
        "You can only view appraisals for the current period.",
      );
    }
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: appraisalId } = await params;
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const body = await req.json();

    if (!appraisalId) {
      return NextResponse.json(
        { error: "Appraisal ID is required" },
        { status: 400 },
      );
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("appraisals")
      .select(
        "id, submitted_by, status, review_quarter, review_year, employee_user_id, supervisor_id, employee_weighted_score, supervisor_weighted_score, company_id, current_grade, employee_name, immediate_supervisor, supervisor_email, deadline_at, archived",
      )
      .eq("id", appraisalId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Appraisal not found" },
        { status: 404 },
      );
    }

    if (!canAccessAppraisalRecord(caller, existing)) {
      return jsonForbidden("You do not have access to this appraisal.");
    }

    // Which side of this record is the caller on? Everyone owns their own
    // self-assessment; the supervisor side requires a strictly senior grade
    // (L3 minimum), with Super Admin as the only exception because L7 has
    // nobody above them.
    const isOwnRecord = Boolean(
      (existing.employee_user_id && existing.employee_user_id === caller.id) ||
        (caller.company_id && caller.company_id === existing.company_id),
    );
    const canActAsSupervisor =
      !isOwnRecord &&
      (isSuperAdmin(caller.role) ||
        canRate(caller.grade_level, existing.current_grade));

    const rejectSupervisorAction = () =>
      isOwnRecord
        ? jsonForbidden(
            "You cannot act as your own supervisor. Someone above your grade must complete this evaluation.",
          )
        : jsonForbidden(
            `Grade ${caller.grade_level ?? "unknown"} cannot appraise a ${existing.current_grade} employee. A supervisor must be L4 or above and senior to the employee.`,
          );

    // Archiving is a filing action, not a workflow state — an archived record
    // is frozen until someone restores it.
    if (existing.archived) {
      return NextResponse.json(
        {
          error:
            "This appraisal is archived. Restore it before making any changes.",
        },
        { status: 409 },
      );
    }

    // A locked appraisal cannot be edited by either party (Section 7).
    // It can only be unlocked via an approved/rejected justification.
    if (existing.status === "locked") {
      return NextResponse.json(
        {
          error:
            "This appraisal is locked. A justification must be reviewed before it can be edited again.",
        },
        { status: 423 },
      );
    }

    // ── Final Review Meeting (kept per business decision — this is what
    // actually finalizes a quarter's score for the annual Final Score
    // average). Only allowed once both parties have submitted. ──────────
    if (body.status === "final_reviewed") {
      if (!canActAsSupervisor) return rejectSupervisorAction();

      if (existing.submitted_by !== "both") {
        return NextResponse.json(
          {
            error:
              "Final review requires both parties to have submitted first.",
          },
          { status: 400 },
        );
      }

      const {
        supervisor_ratings,
        supervisor_weighted_score,
        final_review_notes,
        promotion_readiness,
      } = body;

      if (!supervisor_ratings) {
        return NextResponse.json(
          { error: "supervisor_ratings is required" },
          { status: 400 },
        );
      }

      if (!final_review_notes?.trim()) {
        return NextResponse.json(
          { error: "Discussion notes are required for final review." },
          { status: 400 },
        );
      }

      const { data, error } = await supabaseAdmin
        .from("appraisals")
        .update({
          supervisor_ratings,
          supervisor_weighted_score: supervisor_weighted_score ?? null,
          final_review_notes: final_review_notes ?? null,
          ...(existing.review_quarter === "Q4" && promotion_readiness
            ? { promotion_readiness }
            : {}),
          final_reviewed_by: caller.id,
          final_reviewed_by_name: caller.name,
          final_reviewed_at: new Date().toISOString(),
          status: "final_reviewed",
          final_quarter_score: supervisor_weighted_score ?? null,
          reopened_deadline_at: null,
        })
        .eq("id", appraisalId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      // Q4 finalized → compute the annual Final Score + promotion
      // eligibility (Section 3: only after Q4 is submitted and locked).
      if (existing.review_quarter === "Q4" && existing.employee_user_id) {
        try {
          await recomputeFinalScore(
            supabaseAdmin,
            existing.employee_user_id,
            existing.review_year,
          );
        } catch (e) {
          console.error("[PATCH /api/appraisal/[id]] recomputeFinalScore failed", e);
        }
      }

      return NextResponse.json({ data });
    }

    // ── Employee completing their self-assessment on an existing record ──
    // (the record was seeded by the cron, or the supervisor submitted first)
    if (body.employee_ratings && !body.supervisor_ratings) {
      if (!isOwnRecord) {
        return jsonForbidden("You can only submit your own self-assessment.");
      }

      const employeeSubmittedBy =
        existing.submitted_by === "supervisor" ? "both" : "employee";

      const { data, error } = await supabaseAdmin
        .from("appraisals")
        .update({
          employee_ratings: body.employee_ratings,
          employee_weighted_score: body.employee_weighted_score ?? null,
          employee_email: body.employee_email ?? undefined,
          supervisor_email: body.supervisor_email ?? undefined,
          ...(existing.review_quarter === "Q4" && body.promotion_readiness
            ? { promotion_readiness: body.promotion_readiness }
            : {}),
          section_authorisations_held:
            body.section_authorisations_held ?? undefined,
          submitted_by: employeeSubmittedBy,
          status: employeeSubmittedBy === "both" ? "submitted" : "open",
          employee_submitted_at: new Date().toISOString(),
        })
        .eq("id", appraisalId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (employeeSubmittedBy === "employee" && data?.supervisor_email) {
        void sendSupervisorEvaluationDueEmail({
          supervisorEmail: data.supervisor_email,
          supervisorName: data.immediate_supervisor || "Supervisor",
          employeeName: data.employee_name,
          quarter: data.review_quarter,
          year: data.review_year,
          deadlineAt: data.deadline_at,
          appraisalId: data.id ?? appraisalId,
        }).then((result) => {
          logSupervisorEvaluationEmail("PATCH /api/appraisal/[id]", result, {
            supervisorEmail: data.supervisor_email,
            employeeName: data.employee_name,
            appraisalId: data.id ?? appraisalId,
            quarter: data.review_quarter,
            year: data.review_year,
          });
        });
      } else if (employeeSubmittedBy === "employee" && !data?.supervisor_email) {
        console.warn(
          "[PATCH /api/appraisal/[id]] Supervisor email skipped — no supervisor_email on record",
          { appraisalId: data?.id ?? appraisalId },
        );
      }

      return NextResponse.json({ data });
    }

    // ── Step 2: supervisor submitting their evaluation ──────────────────
    if (!canActAsSupervisor) return rejectSupervisorAction();

    const {
      supervisor_ratings,
      supervisor_weighted_score,
      final_review_date,
      strengths_observed,
      improvement_areas,
      agreed_actions,
      employee_comments,
      most_significant_achievement,
      development_plan_next_year,
      promotion_readiness_assessment,
      compensation_review_input,
      promotion_readiness,
      supervisor_user_id,
    } = body;

    if (!supervisor_ratings) {
      return NextResponse.json(
        { error: "supervisor_ratings is required" },
        { status: 400 },
      );
    }

    const newSubmittedBy =
      existing.submitted_by === "employee" ? "both" : "supervisor";

    const { data, error } = await supabaseAdmin
      .from("appraisals")
      .update({
        supervisor_ratings,
        supervisor_weighted_score: supervisor_weighted_score ?? null,
        final_review_date: final_review_date ?? null,
        strengths_observed: strengths_observed ?? null,
        improvement_areas: improvement_areas ?? null,
        agreed_actions: agreed_actions ?? null,
        employee_comments: employee_comments ?? null,
        most_significant_achievement: most_significant_achievement ?? null,
        development_plan_next_year: development_plan_next_year ?? null,
        promotion_readiness_assessment: promotion_readiness_assessment ?? null,
        compensation_review_input: compensation_review_input ?? null,
        ...(existing.review_quarter === "Q4" && promotion_readiness
          ? { promotion_readiness }
          : {}),
        submitted_by: newSubmittedBy,
        status: newSubmittedBy === "both" ? "submitted" : "open",
        supervisor_submitted_at: new Date().toISOString(),
        supervisor_id: existing.supervisor_id ?? supervisor_user_id ?? null,
        supervisor_reviewed_by: caller.id,
        supervisor_reviewed_by_name: caller.name,
      })
      .eq("id", appraisalId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/appraisal/[id]]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
