import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  computeDeadline,
  getActiveAppraisalPeriod,
  isPeriodAlreadyAppraised,
  isPeriodOpenForNewAppraisal,
  periodLabel,
} from "@/lib/appraisal/deadlines";
import { canRate, type Quarter } from "@/lib/appraisal/sections";
import { fetchGradeLevelsConfig } from "@/lib/grades/fetchGradeLevelsConfig";
import { fetchAppraisalScopeConfig } from "@/lib/grades/fetchAppraisalScopeConfig";
import { isValidAppraisalFormKey } from "@/lib/systemDefinitions/appraisalScopeConfig";
import { isSuperAdmin } from "@/lib/accessControl";
import { sendSupervisorEvaluationDueEmail, logSupervisorEvaluationEmail } from "@/lib/appraisal/emails";
import {
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";

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
      (!employee_ratings && !supervisor_ratings)
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (review_quarter === "Q4" && !promotion_readiness) {
      return NextResponse.json(
        { error: "Promotion readiness is required for Annual appraisals" },
        { status: 400 },
      );
    }

    if (!QUARTERS.includes(review_quarter)) {
      return NextResponse.json(
        { error: "Invalid review_quarter — must be Q1, Q2, Q3, or Q4" },
        { status: 400 },
      );
    }

    // Only the single active period (grace-aware) can receive a new submission.
    // Example: during Q1's post-quarter window that overlaps calendar Q2, Q2
    // must not open yet — keep everyone on Q1.
    if (
      !isPeriodOpenForNewAppraisal(
        review_quarter as Quarter,
        Number(review_year),
      )
    ) {
      const active = getActiveAppraisalPeriod();
      return NextResponse.json(
        {
          error: `Only ${periodLabel(active.quarter, active.year)} is open right now. ${periodLabel(review_quarter as Quarter, Number(review_year))} cannot be started yet.`,
        },
        { status: 409 },
      );
    }

    // Q4 = Annual. No separate "cycle" choice exists anywhere in the UI —
    // it's fully derived from the quarter.
    const cycle = review_quarter === "Q4" ? "annual" : "quarterly";

    const gradeConfig = await fetchGradeLevelsConfig(supabaseAdmin);
    const scopeConfig = await fetchAppraisalScopeConfig(supabaseAdmin);

    // Validate form key (grouped band or individual grade)
    if (!isValidAppraisalFormKey(grade_band, scopeConfig, gradeConfig)) {
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

    const isEmployeeSubmit = (submitted_by ?? "employee") === "employee";
    const ownsRecord =
      (employee_user_id && employee_user_id === caller.id) ||
      (caller.company_id && caller.company_id === company_id);

    if (isEmployeeSubmit) {
      // Everyone fills their own self-assessment — grade is irrelevant here.
      if (!ownsRecord) {
        return jsonForbidden("You can only submit your own self-assessment.");
      }
    } else {
      // The supervisor side must be filled by someone strictly senior. Super
      // Admin is the sole exception, since L7 has nobody above them.
      if (ownsRecord) {
        return jsonForbidden(
          "You cannot act as your own supervisor. Someone above your grade must complete this evaluation.",
        );
      }
      const isSuperAdminCaller = isSuperAdmin(caller.role);
      if (!isSuperAdminCaller && !canRate(caller.grade_level, current_grade)) {
        return jsonForbidden(
          `Grade ${caller.grade_level ?? "unknown"} cannot appraise a ${current_grade} employee. A supervisor must be L4 or above and senior to the employee.`,
        );
      }
    }

    // Confirm company_id exists and load assigned supervisor when present.
    const { data: employeeUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("company_id, user_id, supervisor_id")
      .eq("company_id", company_id)
      .single();

    if (userError || !employeeUser) {
      return NextResponse.json(
        { error: "Employee not found with that company ID" },
        { status: 404 },
      );
    }

    let resolvedSupervisorId: string | null = null;
    if (supervisor_email) {
      const { data: supUser } = await supabaseAdmin
        .from("users")
        .select("user_id")
        .ilike("email", supervisor_email.trim())
        .maybeSingle();
      resolvedSupervisorId = supUser?.user_id ?? null;
    }
    if (!resolvedSupervisorId && employeeUser.supervisor_id) {
      resolvedSupervisorId = employeeUser.supervisor_id;
    }

    // ── Upsert-by-natural-key: one appraisal row per employee per quarter ──
    // A row may already exist if the "open appraisal" cron seeded it at
    // the start of the quarter window.
    const { data: existingOpen } = await supabaseAdmin
      .from("appraisals")
      .select(
        "id, status, submitted_by, employee_email, supervisor_email, supervisor_id, employee_user_id, deadline_at",
      )
      .eq("company_id", company_id)
      .eq("review_quarter", review_quarter)
      .eq("review_year", review_year)
      .maybeSingle();

    if (existingOpen && isPeriodAlreadyAppraised(existingOpen.status)) {
      if (existingOpen.status === "locked") {
        return NextResponse.json(
          {
            error:
              "This quarter's appraisal is locked. A justification must be approved before it can be reopened.",
          },
          { status: 423 },
        );
      }
      return NextResponse.json(
        {
          error: `${periodLabel(review_quarter as Quarter, Number(review_year))} has already been completed for this employee. Duplicate appraisals for the same period are not allowed.`,
        },
        { status: 409 },
      );
    }

    // One submission per side per quarter — do not let a POST overwrite an
    // already-filed self-assessment or supervisor evaluation.
    if (existingOpen) {
      const alreadyEmployee =
        existingOpen.submitted_by === "employee" ||
        existingOpen.submitted_by === "both";
      const alreadySupervisor =
        existingOpen.submitted_by === "supervisor" ||
        existingOpen.submitted_by === "both";

      if (isEmployeeSubmit && alreadyEmployee) {
        return NextResponse.json(
          {
            error: `You have already submitted your self-assessment for ${periodLabel(review_quarter as Quarter, Number(review_year))}. Open the existing appraisal instead of starting a new one.`,
          },
          { status: 409 },
        );
      }
      if (!isEmployeeSubmit && alreadySupervisor) {
        return NextResponse.json(
          {
            error: `The supervisor evaluation for ${periodLabel(review_quarter as Quarter, Number(review_year))} has already been submitted.`,
          },
          { status: 409 },
        );
      }
    }

    const deadlineAt =
      existingOpen?.deadline_at ??
      computeDeadline(review_quarter as Quarter, Number(review_year)).toISOString();

    // Merge submitted_by when the other side already filed on a seeded row.
    const priorSubmittedBy = existingOpen?.submitted_by ?? null;
    let nextSubmittedBy: string = submitted_by ?? "employee";
    if (
      isEmployeeSubmit &&
      (priorSubmittedBy === "supervisor" || priorSubmittedBy === "both")
    ) {
      nextSubmittedBy = "both";
    } else if (
      !isEmployeeSubmit &&
      (priorSubmittedBy === "employee" || priorSubmittedBy === "both")
    ) {
      nextSubmittedBy = "both";
    }

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
      ...(review_quarter === "Q4" && promotion_readiness
        ? { promotion_readiness }
        : {}),
      strengths_observed: strengths_observed ?? null,
      improvement_areas: improvement_areas ?? null,
      agreed_actions: agreed_actions ?? null,
      employee_comments: employee_comments ?? null,
      most_significant_achievement: most_significant_achievement ?? null,
      development_plan_next_year: development_plan_next_year ?? null,
      promotion_readiness_assessment: promotion_readiness_assessment ?? null,
      compensation_review_input: compensation_review_input ?? null,
      // Only write the side being submitted — never null out the other party.
      ...(isEmployeeSubmit
        ? {
            employee_ratings: employee_ratings ?? null,
            employee_weighted_score: employee_weighted_score ?? null,
            employee_submitted_at: new Date().toISOString(),
          }
        : {
            supervisor_ratings: supervisor_ratings ?? null,
            supervisor_weighted_score: supervisor_weighted_score ?? null,
            supervisor_submitted_at: new Date().toISOString(),
            supervisor_reviewed_by: caller.id,
            supervisor_reviewed_by_name: caller.name,
            final_review_date: final_review_date ?? null,
          }),
      submitted_by: nextSubmittedBy,
      deadline_at: deadlineAt,
      employee_user_id: employee_user_id ?? existingOpen?.employee_user_id ?? null,
      supervisor_id: resolvedSupervisorId ?? existingOpen?.supervisor_id ?? null,
      status: nextSubmittedBy === "both" ? "submitted" : "open",
      ...(!existingOpen
        ? { employee_penalty_points: 0, appeal_exhausted: false }
        : {}),
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
      void sendSupervisorEvaluationDueEmail({
        supervisorEmail: data.supervisor_email,
        supervisorName,
        employeeName: employee_name,
        quarter: review_quarter,
        year: review_year,
        deadlineAt: data.deadline_at,
        appraisalId: data.id,
      }).then((result) => {
        logSupervisorEvaluationEmail(
          "POST /api/appraisal/upload_appraisal",
          result,
          {
            supervisorEmail: data.supervisor_email,
            employeeName: employee_name,
            appraisalId: data.id,
            quarter: review_quarter,
            year: review_year,
          },
        );
      });
    } else if (submitted_by === "employee" && !data?.supervisor_email) {
      console.warn(
        "[POST /api/appraisal/upload_appraisal] Supervisor email skipped — no supervisor_email on record",
        { appraisalId: data?.id, company_id, review_quarter, review_year },
      );
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[POST /api/appraisal/upload_appraisal]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
