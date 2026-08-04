import type { NextApiRequest, NextApiResponse } from "next";
import { sendDeadlineReminders } from "@/lib/reminders/sendReminders";
import { runScheduledMonthlyReportIfDue } from "@/lib/reports/scheduledReportRunner";

// Triggered daily at 9am (Africa/Accra = UTC, so "0 9 * * *" in vercel.json
// is 9am on the farm) by Vercel Cron. Lives in the Pages Router because it
// transitively imports sendMonthlyReport, which uses @react-pdf/renderer —
// see the comment in src/pages/api/task-manager/reports/send.tsx for why
// that has to stay out of the App Router.
//
// Does two independent jobs every run:
//   1. Deadline reminders — actually only sends on Mondays (checked inside
//      sendDeadlineReminders itself, not here), a weekly digest of
//      everything overdue/coming up. The cron still runs daily rather than
//      weekly because job 2 below needs a daily check.
//   2. The monthly report — only actually generates/sends on the
//      configured day of the month, and only once per month.
// Each is wrapped separately so one failing doesn't stop the other.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically
  // when a CRON_SECRET env var is set on the project. Locally (no
  // CRON_SECRET set) this check is skipped so it stays easy to trigger by
  // hand with curl/Postman while testing.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.authorization ?? "";
    if (authHeader !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const result: { reminders: unknown; report: unknown } = { reminders: null, report: null };

  try {
    result.reminders = await sendDeadlineReminders();
  } catch (err: any) {
    console.error("[cron/daily] reminders failed", err);
    result.reminders = { error: err.message ?? "Failed to send reminders" };
  }

  try {
    result.report = await runScheduledMonthlyReportIfDue();
  } catch (err: any) {
    console.error("[cron/daily] scheduled report failed", err);
    result.report = { error: err.message ?? "Failed to run scheduled report" };
  }

  return res.status(200).json(result);
}
