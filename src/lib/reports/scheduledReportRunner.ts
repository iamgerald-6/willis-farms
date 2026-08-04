import { supabaseAdmin } from "@/lib/taskManagerAuth";
import { sendMonthlyReport } from "@/lib/reports/sendMonthlyReport";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Called once a day by the cron job. Checks the tm_report_schedule
 * singleton row and, if today is the configured day and this month's
 * report hasn't already gone out, generates + emails the PREVIOUS calendar
 * month's report (the month that just closed) to the configured
 * recipients.
 *
 * Dates are read with the UTC getters deliberately, not local server time —
 * Ghana (where Wills Farms operates) is UTC+0 year-round, so "today" in
 * UTC is always the same calendar day as "today" for the farm. This also
 * makes the check independent of whatever timezone the Vercel function
 * happens to run in.
 */
export async function runScheduledMonthlyReportIfDue() {
  const { data: schedule, error } = await supabaseAdmin.from("tm_report_schedule").select("*").limit(1).single();
  if (error || !schedule) return { skipped: true, reason: "no schedule row configured" };
  if (!schedule.enabled) return { skipped: true, reason: "schedule disabled" };

  const now = new Date();
  if (now.getUTCDate() !== schedule.day_of_month) {
    return { skipped: true, reason: `not the configured day (today is ${now.getUTCDate()}, configured for ${schedule.day_of_month})` };
  }

  const thisMonthKey = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  if (schedule.last_sent_period === thisMonthKey) {
    return { skipped: true, reason: "already sent for this period" };
  }

  const recipients: string[] = Array.isArray(schedule.recipients) ? schedule.recipients : [];
  if (recipients.length === 0) {
    return { skipped: true, reason: "no recipients configured" };
  }

  // Previous calendar month: day 0 of "this month" is the last day of the
  // month before it.
  const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const prevMonthStart = new Date(Date.UTC(prevMonthEnd.getUTCFullYear(), prevMonthEnd.getUTCMonth(), 1));
  const period_start = prevMonthStart.toISOString().slice(0, 10);
  const period_end = prevMonthEnd.toISOString().slice(0, 10);

  const result = await sendMonthlyReport({
    period_start,
    period_end,
    recipients,
    generatedByUserId: null,
    generatedByName: "Automatic Schedule",
  });

  await supabaseAdmin
    .from("tm_report_schedule")
    .update({ last_sent_period: thisMonthKey, updated_at: new Date().toISOString() })
    .eq("id", schedule.id);

  return { skipped: false, period_start, period_end, ...result };
}
