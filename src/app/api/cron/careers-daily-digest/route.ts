import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { sendAiScreeningDigestEmail } from "@/lib/careers/aiScreeningDigestEmail";
import { screenApplication } from "@/lib/careers/screenApplication";

// Runs once daily at 08:00 Ghana time (Ghana is UTC+0 year-round, so this
// is 08:00 UTC in vercel.json). Everything happens in one batch, once a
// day, against the PREVIOUS calendar day's applications — not on
// submission, not on a polling interval:
//   1. Grade any of yesterday's applications the AI hasn't screened yet
//      (reads the CV against the job's key responsibilities, minimum
//      qualifications, experience, and required skills/attributes).
//   2. Tally yesterday's totals and email HR the summary.
// If nothing was submitted yesterday, this does nothing at all — no
// grading, no email.
// HR can also trigger screening immediately from the recruitment inbox.
export const maxDuration = 300;

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
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const now = new Date();
    const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayStart = new Date(todayUtcMidnight.getTime() - 24 * 60 * 60 * 1000);
    const dateLabel = yesterdayStart.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const { data: rows, error } = await supabaseAdmin
      .from("job_applications")
      .select("id, status, role_title, role_slug, job_posting_id, cv_url, ai_screening, application_form_data")
      .eq("submission_status", "submitted")
      .gte("created_at", yesterdayStart.toISOString())
      .lt("created_at", todayUtcMidnight.toISOString());

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: true, summary: { total: 0, ranAt: now.toISOString() } });
    }

    const errors: string[] = [];
    for (const row of rows) {
      if (row.ai_screening) continue;
      const result = await screenApplication(supabaseAdmin, row);
      if (!result.ok) errors.push(`${row.id}: ${result.error}`);
      else row.status = result.status;
    }

    const total = rows.length;
    const shortlisted = rows.filter((r) => r.status === "shortlisted").length;
    const underReview = rows.filter((r) => r.status === "under_review").length;
    const stillPending = rows.filter((r) => r.status === "applied").length;

    const emailResult = await sendAiScreeningDigestEmail({
      dateLabel,
      total,
      shortlisted,
      underReview,
      stillPending,
    });

    return NextResponse.json({
      success: true,
      summary: {
        total,
        shortlisted,
        underReview,
        stillPending,
        emailSent: emailResult.sent,
        emailError: emailResult.error,
        screeningErrors: errors,
      },
    });
  } catch (err) {
    console.error("[GET /api/cron/careers-daily-digest]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
