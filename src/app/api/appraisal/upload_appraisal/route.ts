import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { computeDeadline } from "@/lib/appraisal/deadlines";
import type { Quarter } from "@/lib/appraisal/sections";
import { sendSupervisorEvaluationDueEmail } from "@/lib/appraisal/emails";
import {
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { hasFullAppraisalAccess, isSupervisor } from "@/lib/accessControl";

const QUARTERS: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];

export async function POST(req: NextRequest) {
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

    const {
      company_id,
      employee_name,
      job_title,
      current_grade,
      section_authorisations_held,
      immediate_supervisor,
      supervisor_email,
      employee_email,
      grade_band,
      review_quarter,
      review_year,
      reviewing_manager,
      period_covered,
      promotion_readiness,
      strengths_observed,
      improvement_areas,
      agreed_actions,
      employee_comments,
      most_significant_achievement,
      development_plan_next_year,
      promotion_readiness_assessment,
      compensation_review_input,
      employee_ratings,
      supervisor_ratings,
      employee_weighted_score,
      supervisor_weighted_score,
      submitted_by,
      final_review_date,
      employee_user_id,
    } = body;

    // Validate required fields
    if (
      !company_id ||
      !employee_name ||
      !current_grade ||
      !immediate_supervisor ||
      !grade_band ||
      !review_year ||
      !review_quarter ||
      !promotion_readiness ||
      (!employee_ratings && !supervisor_ratings)
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (!QUARTERS.includes(review_quarter)) {
      return NextResponse.json(
        { error: "Invalid review_quarter — must be Q1, Q2, Q3, or Q4" },
        { status: 400 },
      );
    }

    // Q4 = Annual. No separate "cycle" choice exists anywhere in the UI —
    // it's fully derived from the quarter.
    const cycle = review_quarter === "Q4" ? "annual" : "quarterly";

    // Validate grade band
    if (!["L1", "L2_L3", "L4", "L5_L6_L7"].includes(grade_band)) {
      return NextResponse.json(
        { error: "Invalid grade band" },
        { status: 400 },
      );
    }

    const validSubmittedBy = ["employee", "supervisor"];
    if (submitted_by && !validSubmittedBy.includes(submitted_by)) {
      return NextResponse.json(
        {
          error:
            "Invalid submitted_by value. Must be 'employee' or 'supervisor'.",
        },
        { status: 400 },
      );
    }

    // The employee's self-assessment must include their email (used to
    // route the supervisor notification and reminders).
    if (submitted_by === "employee" && !employee_email) {
      return NextResponse.json(
        { error: "employee_email is required for the self-assessment" },
        { status: 400 },
      );
    }

    const fullAccess = hasFullAppraisalAccess(caller.role, caller.grade_level);
    const isEmployeeSubmit = (submitted_by ?? "employee") === "employee";

    if (!fullAccess) {
      if (isEmployeeSubmit) {
        const ownsRecord =
          (employee_user_id && employee_user_id === caller.id) ||
          (caller.company_id && caller.company_id === company_id);
        if (!ownsRecord) {
          return jsonForbidden("You can only submit your own self-assessment.");
        }
      } else if (!isSupervisor(caller.grade_level)) {
        return jsonForbidden(
          "Only supervisors (L4+) or managers can submit supervisor evaluations.",
        );
      }
    }

    // Confirm company_id exists in users table
    const { data: userExists, error: userError } = await supabaseAdmin
      .from("users")
      .select("company_id")
      .eq("company_id", company_id)
      .single();

    if (userError || !userExists) {
      return NextResponse.json(
        { error: "Employee not found with that company ID" },
        { status: 404 },
      );
    }

    // Try to resolve the supervisor's user record from the email they
    // were given (there's no formal manager_id link in this schema), so
    // penalties/full-name display can be attributed correctly later.
    let resolvedSupervisorId: string | null = null;
    if (supervisor_email) {
      const { data: supUser } = await supabaseAdmin
        .from("users")
        .select("user_id")
        .ilike("email", supervisor_email.trim())
        .maybeSingle();
      resolvedSupervisorId = supUser?.user_id ?? null;
    }

    // ── Upsert-by-natural-key: one appraisal row per employee per quarter ──
    // A row may already exist if the "open appraisal" cron seeded it at
    // the start of the quarter window.
    const { data: existingOpen } = await supabaseAdmin
      .from("appraisals")
      .select("id, status, employee_email, supervisor_email, supervisor_id, employee_user_id, deadline_at")
      .eq("company_id", company_id)
      .eq("review_quarter", review_quarter)
      .eq("review_year", review_year)
      .maybeSingle();

    if (existingOpen && existingOpen.status === "locked") {
      return NextResponse.json(
        {
          error:
            "This quarter's appraisal is locked. A justification must be approved before it can be reopened.",
        },
        { status: 423 },
      );
    }

    const deadlineAt =
      existingOpen?.deadline_at ??
      computeDeadline(review_quarter as Quarter, Number(review_year)).toISOString();

    const basePayload: Record<string, unknown> = {
      company_id,
      employee_name,
      job_title,
      current_grade,
      section_authorisations_held: section_authorisations_held ?? null,
      immediate_supervisor,
      supervisor_email: supervisor_email ?? existingOpen?.supervisor_email ?? null,
      employee_email: employee_email ?? existingOpen?.employee_email ?? null,
      cycle,
      grade_band,
      review_quarter,
      review_year,
      reviewing_manager: reviewing_manager ?? null,
      period_covered: period_covered ?? null,
      promotion_readiness,
      strengths_observed: strengths_observed ?? null,
      improvement_areas: improvement_areas ?? null,
      agreed_actions: agreed_actions ?? null,
      employee_comments: employee_comments ?? null,
      most_significant_achievement: most_significant_achievement ?? null,
      development_plan_next_year: development_plan_next_year ?? null,
      promotion_readiness_assessment: promotion_readiness_assessment ?? null,
      compensation_review_input: compensation_review_input ?? null,
      employee_ratings: employee_ratings ?? null,
      supervisor_ratings: supervisor_ratings ?? null,
      employee_weighted_score: employee_weighted_score ?? null,
      supervisor_weighted_score: supervisor_weighted_score ?? null,
      submitted_by: submitted_by ?? "employee",
      final_review_date: final_review_date ?? null,
      deadline_at: deadlineAt,
      employee_user_id: employee_user_id ?? existingOpen?.employee_user_id ?? null,
      supervisor_id: resolvedSupervisorId ?? existingOpen?.supervisor_id ?? null,
      employee_penalty_points: 0,
      appeal_exhausted: false,
      // Still only one party done on first submission — "open" until both
      // employee and supervisor have submitted (see [id]/route.ts PATCH).
      status: "open",
      ...(submitted_by === "employee"
        ? { employee_submitted_at: new Date().toISOString() }
        : { supervisor_submitted_at: new Date().toISOString() }),
    };

    let data;
    let error;
    if (existingOpen) {
      const res = await supabaseAdmin
        .from("appraisals")
        .update(basePayload)
        .eq("id", existingOpen.id)
        .select()
        .single();
      data = res.data;
      error = res.error;
    } else {
      const res = await supabaseAdmin
        .from("appraisals")
        .insert([basePayload])
        .select()
        .single();
      data = res.data;
      error = res.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Employee submitted first → notify supervisor immediately (Section 6).
    if (submitted_by === "employee" && data?.supervisor_email) {
      const supervisorName = data.immediate_supervisor || "Supervisor";
      sendSupervisorEvaluationDueEmail({
        supervisorEmail: data.supervisor_email,
        supervisorName,
        employeeName: employee_name,
        quarter: review_quarter,
        year: review_year,
        deadlineAt: data.deadline_at,
      }).then((result) => {
        if (!result.sent) {
          console.warn(
            "[POST /api/appraisal/upload_appraisal] Supervisor notify email not sent:",
            result.error,
          );
        }
      });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[POST /api/appraisal/upload_appraisal]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
