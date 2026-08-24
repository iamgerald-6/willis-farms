import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { sendRejectionEmail } from "@/lib/careers/interviewEmails";
import { normalizeInterviewFormData, type JobApplication } from "@/lib/careers/types";
import { appendStatusHistory } from "@/lib/careers/statusHistory";

// Rescinds an outstanding offer — only reachable while status is "offer"
// (i.e. before "Send onboarding link" has moved them on to "onboarding").
// Puts the applicant through the exact same shape as an evaluation
// Do-not-hire: decision flips to "do_not_hire", status becomes "rejected",
// and the same decline email goes out — so they land in the Rejects tab
// indistinguishable from any other confirmed reject, reconsideration
// included.
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { application_id, rescinded_by }: { application_id?: string; rescinded_by?: string } =
    await req.json();
  if (!application_id) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  const { data: application, error } = await supabaseAdmin
    .from("job_applications")
    .select("*")
    .eq("id", application_id)
    .single();

  if (error || !application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const app = application as JobApplication;

  if (app.status !== "offer") {
    return NextResponse.json(
      { error: "An offer can only be rescinded while it's outstanding." },
      { status: 400 },
    );
  }

  const formData = normalizeInterviewFormData(app.interview_form_data);
  if (formData.summary?.decision !== "hire") {
    return NextResponse.json(
      { error: "There is no confirmed hire decision to rescind." },
      { status: 400 },
    );
  }

  try {
    const confirmedAt = new Date().toISOString();
    const mergedFormData = {
      ...formData,
      summary: {
        ...formData.summary,
        decision: "do_not_hire" as const,
        decision_confirmed_at: confirmedAt,
        decision_confirmed_by: rescinded_by ?? undefined,
      },
    };

    const status_history = appendStatusHistory(app.status_history, "rejected", rescinded_by);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("job_applications")
      .update({
        status: "rejected",
        status_history,
        interview_form_data: mergedFormData,
      })
      .eq("id", application_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const emailResult = await sendRejectionEmail({
      candidateName: app.full_name,
      candidateEmail: app.email,
      roleTitle: app.role_title,
      referenceNumber: app.reference_number,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      email_warning: emailResult.sent ? undefined : emailResult.error,
    });
  } catch (err) {
    console.error("[POST /api/careers/onboarding/rescind]", err);
    return NextResponse.json({ error: "Failed to rescind offer." }, { status: 500 });
  }
}
