import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

const FULL_SELECT = `
  *,
  employee:users!skill_logs_employee_id_fkey (user_id, first_name, last_name, grade_level),
  supervisor:users!skill_logs_supervisor_id_fkey (user_id, first_name, last_name, grade_level),
  skill_log_competencies (*)
`;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { success: false, message: "Server configuration error" },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("skill_logs")
    .select(FULL_SELECT)
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { success: false, message: "Skill log not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { success: false, message: "Server configuration error" },
      { status: 500 },
    );
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("skill_logs")
    .select("id, supervisor_id, employee_id, status")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json(
      { success: false, message: "Skill log not found" },
      { status: 404 },
    );
  }

  const body = await req.json();
  const {
    log_type,
    review_period,
    section,
    tier_auth,
    strengths_observed,
    development_gaps,
    status,
    competencies,
    signed_off_by,
    signed_off_at,
  } = body;

  // ── Sign-off fast path ──
  if (status === "signed_off") {
    const { data: signedData, error: signedError } = await supabaseAdmin
      .from("skill_logs")
      .update({
        status: "signed_off",
        signed_off_by: signed_off_by ?? null,
        signed_off_at: signed_off_at ?? null,
      })
      .eq("id", id)
      .select()
      .single();

    if (signedError) {
      return NextResponse.json(
        { success: false, message: signedError.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true, data: signedData });
  }

  if (existing.status === "signed_off") {
    return NextResponse.json(
      { success: false, message: "Signed-off logs cannot be edited" },
      { status: 400 },
    );
  }

  let overall_rating: number | null = null;
  if (competencies?.length > 0) {
    const ratings = competencies
      .map((c: any) => c.rating)
      .filter((r: any) => r !== null && r !== undefined && !isNaN(r));
    overall_rating =
      ratings.length > 0
        ? Math.round(
            (ratings.reduce((a: number, b: number) => a + b, 0) /
              ratings.length) *
              10,
          ) / 10
        : null;
  }

  const { error: updateError } = await supabaseAdmin
    .from("skill_logs")
    .update({
      ...(log_type !== undefined && { log_type }),
      ...(review_period !== undefined && { review_period }),
      ...(section !== undefined && { section }),
      ...(tier_auth !== undefined && { tier_auth }),
      ...(strengths_observed !== undefined && { strengths_observed }),
      ...(development_gaps !== undefined && { development_gaps }),
      ...(status !== undefined && { status }),
      ...(overall_rating !== null && { overall_rating }),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { success: false, message: updateError.message },
      { status: 400 },
    );
  }

  if (competencies?.length > 0) {
    await supabaseAdmin
      .from("skill_log_competencies")
      .delete()
      .eq("skill_log_id", id);

    const rows = competencies.map((c: any) => ({
      skill_log_id: id,
      skill: c.skill,
      observed: c.observed || null,
      performed_under_supervision: c.performed_under_supervision || null,
      performed_consistently: c.performed_consistently || null,
      rating: c.rating ?? null,
      comments: c.comments ?? null,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("skill_log_competencies")
      .insert(rows);
    if (insertError) {
      return NextResponse.json(
        { success: false, message: insertError.message },
        { status: 400 },
      );
    }
  }

  const { data: fullLog, error: fullFetchError } = await supabaseAdmin
    .from("skill_logs")
    .select(FULL_SELECT)
    .eq("id", id)
    .single();

  if (fullFetchError) {
    return NextResponse.json(
      { success: false, message: fullFetchError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, data: fullLog });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { success: false, message: "Server configuration error" },
      { status: 500 },
    );
  }

  // Delete competencies first (foreign key)
  await supabaseAdmin
    .from("skill_log_competencies")
    .delete()
    .eq("skill_log_id", id);

  const { error } = await supabaseAdmin
    .from("skill_logs")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
