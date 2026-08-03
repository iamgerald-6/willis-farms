import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement } from "@/lib/taskManagerAuth";
import { sendDeadlineReminders } from "@/lib/reminders/sendReminders";

// POST /api/task-manager/reminders/test — lets Senior Management run the
// exact same weekly-digest scan the Monday cron runs, on demand, instead
// of waiting for Monday. Passes force: true so it ignores the day-of-week
// check. It's a real send (an actual email goes out if RESEND_API_KEY is
// set), but there's no dedup to worry about — it's just a fresh snapshot
// of what's currently overdue/coming up, so running it again immediately
// just resends the same current picture.
export async function POST(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  try {
    const result = await sendDeadlineReminders({ force: true });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[POST /api/task-manager/reminders/test]", err);
    return NextResponse.json({ error: err.message ?? "Failed to send test reminders" }, { status: 500 });
  }
}
