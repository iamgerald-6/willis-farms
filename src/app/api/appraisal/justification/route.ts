import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { hasFullAppraisalAccess } from "@/lib/accessControl";

/**
 * Justification Form (Section 8) — its own dedicated resource, not a field
 * bolted onto the appraisal. A supervisor submits one to explain why they
 * missed the deadline and request the 10-point deduction be waived.
 */
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
    const { appraisal_id, supervisor_id, reason_text } = body;

    if (!appraisal_id || !supervisor_id || !reason_text?.trim()) {
      return NextResponse.json(
        { error: "appraisal_id, supervisor_id, and reason_text are required" },
        { status: 400 },
      );
    }

    if (supervisor_id !== caller.id) {
      return jsonForbidden("supervisor_id must match the authenticated user.");
    }

    const { data: appraisal, error: appraisalError } = await supabaseAdmin
      .from("appraisals")
      .select("id, status, locked_reason, supervisor_id, employee_name, review_quarter, review_year, appeal_exhausted")
      .eq("id", appraisal_id)
      .single();

    if (appraisalError || !appraisal) {
      return NextResponse.json({ error: "Appraisal not found" }, { status: 404 });
    }

    if (appraisal.appeal_exhausted) {
      return NextResponse.json(
        { error: "No further appeals are permitted for this appraisal." },
        { status: 400 },
      );
    }

    const { data: existingJustification } = await supabaseAdmin
      .from("appraisal_justifications")
      .select("id")
      .eq("appraisal_id", appraisal_id)
      .maybeSingle();

    if (existingJustification) {
      return NextResponse.json(
        { error: "A justification has already been submitted for this appraisal." },
        { status: 400 },
      );
    }

    if (appraisal.status !== "locked" || appraisal.locked_reason !== "supervisor_incomplete") {
      return NextResponse.json(
        {
          error:
            "A justification can only be submitted for an appraisal locked due to a missed supervisor evaluation.",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("appraisal_justifications")
      .insert({
        appraisal_id,
        supervisor_id,
        reason_text: reason_text.trim(),
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/appraisal/justification]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const appraisal_id = searchParams.get("appraisal_id");
    const supervisor_id = searchParams.get("supervisor_id");

    const fullAccess = hasFullAppraisalAccess(caller.role, caller.grade_level);

    if (supervisor_id && supervisor_id !== caller.id && !fullAccess) {
      return jsonForbidden("You can only view your own justifications.");
    }

    if (!fullAccess && !appraisal_id && !supervisor_id) {
      return jsonForbidden("Insufficient permissions to list justifications.");
    }

    let query = supabaseAdmin
      .from("appraisal_justifications")
      .select("*, appraisals(employee_name, review_quarter, review_year, job_title)")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (appraisal_id) query = query.eq("appraisal_id", appraisal_id);
    if (supervisor_id) query = query.eq("supervisor_id", supervisor_id);

    if (!fullAccess && !supervisor_id) {
      query = query.eq("supervisor_id", caller.id);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/appraisal/justification]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
