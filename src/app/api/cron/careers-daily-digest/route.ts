import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { sendAiScreeningDigestEmail } from "@/lib/careers/aiScreeningDigestEmail";

// Runs once daily at 08:00 Ghana time (Ghana is UTC+0 year-round, so this
// is 08:00 UTC in vercel.json) and summarizes the PREVIOUS calendar day's
// applications — by then the screen-applications cron (every 15-30 min)
// has had all day to grade anything submitted yesterday.
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

    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .select("status")
      .eq("submission_status", "submitted")
      .gte("created_at", yesterdayStart.toISOString())
      .lt("created_at", todayUtcMidnight.toISOString());

    if (error) throw error;

    const rows = data ?? [];
    const total = rows.length;
    const shortlisted = rows.filter((r) => r.status === "shortlisted").length;
    const underReview = rows.filter((r) => r.status === "under_review").length;
    const stillPending = rows.filter((r) => r.status === "applied").length;

    if (total === 0) {
      return NextResponse.json({ success: true, summary: { total: 0, sent: false } });
    }

    const result = await sendAiScreeningDigestEmail({
      dateLabel,
      total,
      shortlisted,
      underReview,
      stillPending,
    });

    return NextResponse.json({
      success: true,
      summary: { total, shortlisted, underReview, stillPending, emailSent: result.sent, emailError: result.error },
    });
  } catch (err) {
    console.error("[GET /api/cron/careers-daily-digest]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
