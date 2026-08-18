import { NextRequest, NextResponse } from "next/server";
import { rollHourlyTaskDates } from "@/lib/taskHourlyRollover";

// GET /api/task-manager/cron/hourly-rollover
// Triggered by Vercel Cron at 5pm, Monday-Friday, Africa/Accra time (see
// vercel.json — "0 17 * * 1-5"; Accra has no DST so this is a fixed UTC
// hour with no drift). Advances every active Hourly-frequency task's
// due_date to the next weekday — see rollHourlyTaskDates for the full
// rationale. Same CRON_SECRET auth pattern as the other cron routes.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await rollHourlyTaskDates();
    return NextResponse.json({ success: !result.error, ...result });
  } catch (err: any) {
    console.error("[GET /api/task-manager/cron/hourly-rollover]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
