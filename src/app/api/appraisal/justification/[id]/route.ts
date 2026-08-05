import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { computeReopenDeadline } from "@/lib/appraisal/deadlines";
import { recomputeFinalScore } from "@/lib/appraisal/server";
import { sendJustificationDecisionEmail } from "@/lib/appraisal/emails";
import {
  requireFullAppraisalAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";

/**
 * Reviewer decision on a justification (Section 8). Any Manager, L5+
 * employee, Admin, or Super Admin can approve/reject and unlock the
 * appraisal either way — approval waives the 10-point deduction,
 * rejection lets it stand.
 */
export async function PATCH(
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

  try {
    const reviewer = await requireFullAppraisalAccess(req);
    if (!reviewer) {
      return jsonForbidden(
        "Only a Manager, Admin, Super Admin, or L5+ employee can review a justification.",
      );
    }

    const body = await req.json();
    const { decision, reviewer_id, review_notes } = body;

    if (!id || !decision || !reviewer_id) {
      return NextResponse.json(
        { error: "decision and reviewer_id are required" },
        { status: 400 },
      );
    }
    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json(
        { error: "decision must be 'approved' or 'rejected'" },
        { status: 400 },
      );
    }

    if (reviewer_id !== reviewer.id) {
      return jsonForbidden("reviewer_id must match the authenticated user.");
    }

    const { data: justification, error: justError } = await supabaseAdmin
      .from("appraisal_justifications")
      .select("id, appraisal_id, supervisor_id, status")
      .eq("id", id)
      .single();

    if (justError || !justification) {
      return NextResponse.json({ error: "Justification not found" }, { status: 404 });
    }

    if (justification.status !== "pending") {
      return NextResponse.json(
        { error: "This justification has already been reviewed." },
        { status: 400 },
      );
    }

    const { data: appraisal } = await supabaseAdmin
      .from("appraisals")
      .select("id, employee_name, employee_email, supervisor_email, immediate_supervisor, review_quarter, review_year, appeal_exhausted")
      .eq("id", justification.appraisal_id)
      .single();

    if (appraisal?.appeal_exhausted) {
      return NextResponse.json(
        { error: "This appraisal has exhausted its appeal window." },
        { status: 400 },
      );
    }

    const reviewerName = reviewer.name || "HR";
    const approved = decision === "approved";
    const reviewedAt = new Date().toISOString();
    const reopenedDeadline = approved
      ? computeReopenDeadline(reviewedAt).toISOString()
      : null;

    const { data: updatedJustification, error: updateError } = await supabaseAdmin
      .from("appraisal_justifications")
      .update({
        status: decision,
        reviewed_by: reviewer_id,
        reviewed_by_name: reviewerName,
        review_notes: review_notes ?? null,
        reviewed_at: reviewedAt,
        points_waived: approved,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    if (approved) {
      await supabaseAdmin
        .from("appraisals")
        .update({
          status: "reopened",
          locked_reason: null,
          reopened_deadline_at: reopenedDeadline,
          employee_penalty_points: 0,
        })
        .eq("id", justification.appraisal_id);
    } else {
      await supabaseAdmin
        .from("appraisals")
        .update({
          appeal_exhausted: true,
        })
        .eq("id", justification.appraisal_id);
    }

    // Waive (or confirm) the linked penalty.
    await supabaseAdmin
      .from("supervisor_penalties")
      .update({ waived: approved, justification_id: id })
      .eq("appraisal_id", justification.appraisal_id);

    // If the supervisor's own Final Score for that year was already
    // computed, recompute it now that the penalty status may have changed.
    if (appraisal) {
      try {
        await recomputeFinalScore(
          supabaseAdmin,
          justification.supervisor_id,
          appraisal.review_year,
        );
      } catch (e) {
        console.error("[PATCH /api/appraisal/justification/[id]] recompute failed", e);
      }
    }

    if (appraisal) {
      const { data: supervisorUser } = await supabaseAdmin
        .from("users")
        .select("email, first_name, last_name")
        .eq("user_id", justification.supervisor_id)
        .maybeSingle();

      const supervisorEmail = supervisorUser?.email ?? appraisal.supervisor_email;
      const supervisorName =
        `${supervisorUser?.first_name ?? ""} ${supervisorUser?.last_name ?? ""}`.trim() ||
        appraisal.immediate_supervisor ||
        "Supervisor";

      if (supervisorEmail) {
        sendJustificationDecisionEmail({
          toEmail: supervisorEmail,
          toName: supervisorName,
          approved,
          employeeName: appraisal.employee_name,
          quarter: appraisal.review_quarter,
          year: appraisal.review_year,
          reviewerName,
          reviewNotes: review_notes,
        }).catch((e) => console.warn("Justification decision email (supervisor) failed", e));
      }

      if (appraisal.employee_email) {
        sendJustificationDecisionEmail({
          toEmail: appraisal.employee_email,
          toName: appraisal.employee_name,
          approved,
          employeeName: appraisal.employee_name,
          quarter: appraisal.review_quarter,
          year: appraisal.review_year,
          reviewerName,
          reviewNotes: review_notes,
        }).catch((e) => console.warn("Justification decision email (employee) failed", e));
      }
    }

    return NextResponse.json({ success: true, data: updatedJustification });
  } catch (err) {
    console.error("[PATCH /api/appraisal/justification/[id]]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
