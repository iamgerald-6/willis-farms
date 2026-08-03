import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { recomputeFinalScore } from "@/lib/appraisal/server";

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
        "id, submitted_by, status, review_quarter, review_year, employee_user_id, supervisor_id, employee_weighted_score, supervisor_weighted_score",
      )
      .eq("id", appraisalId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Appraisal not found" },
        { status: 404 },
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
          promotion_readiness: promotion_readiness ?? undefined,
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

    // ── Step 2: supervisor submitting their evaluation ──────────────────
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
        promotion_readiness: promotion_readiness ?? undefined,
        submitted_by: newSubmittedBy,
        status: newSubmittedBy === "both" ? "submitted" : "open",
        supervisor_submitted_at: new Date().toISOString(),
        supervisor_id: existing.supervisor_id ?? supervisor_user_id ?? null,
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
