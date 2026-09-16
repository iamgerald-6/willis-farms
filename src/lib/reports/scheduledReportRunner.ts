import { supabaseAdmin } from "@/lib/taskManagerAuth";
import { sendMonthlyReport } from "@/lib/reports/sendMonthlyReport";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Called once a day by the cron job. tm_report_schedule can now hold
 * multiple rows — one per site (site_id set) plus at most one company-wide
 * row (site_id null, unfiltered — every project) — see
 * docs/multi-site/add-site-id-tm-report-schedule.sql. Each row is checked
 * and sent independently: a site's report can be due on a different day,
 * with a different recipient list, than another site's or the company-wide
 * one.
 *
 * Dates are read with the UTC getters deliberately, not local server time —
 * Ghana (where Wills Farms operates) is UTC+0 year-round, so "today" in
 * UTC is always the same calendar day as "today" for the farm. This also
 * makes the check independent of whatever timezone the Vercel function
 * happens to run in.
 */
export async function runScheduledMonthlyReportIfDue() {
  const { data: schedules, error } = await supabaseAdmin.from("tm_report_schedule").select("*");
  if (error) return { skipped: true, reason: `failed to load schedules: ${error.message}` };
  if (!schedules || schedules.length === 0) return { skipped: true, reason: "no schedule rows configured" };

  const now = new Date();
  const thisMonthKey = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;

  // Previous calendar month: day 0 of "this month" is the last day of the
  // month before it. Same for every row — the calendar doesn't change per
  // site.
  const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const prevMonthStart = new Date(Date.UTC(prevMonthEnd.getUTCFullYear(), prevMonthEnd.getUTCMonth(), 1));
  const period_start = prevMonthStart.toISOString().slice(0, 10);
  const period_end = prevMonthEnd.toISOString().slice(0, 10);

  // Site labels for the email subject/PDF/log — best effort; a missing
  // label just means the subject line omits the site name, not a hard
  // failure of the whole run.
  const siteIds = schedules.map((s) => s.site_id).filter((id): id is number => id != null);
  const siteLabelById = new Map<number, string>();
  if (siteIds.length > 0) {
    const { data: sites } = await supabaseAdmin.from("sites").select("id, name").in("id", siteIds);
    for (const s of sites ?? []) siteLabelById.set(s.id, s.name as string);
  }

  const results: Array<{ site_id: number | null; skipped: boolean; reason?: string; period_start?: string; period_end?: string }> = [];

  for (const schedule of schedules) {
    const siteId: number | null = schedule.site_id ?? null;

    if (!schedule.enabled) {
      results.push({ site_id: siteId, skipped: true, reason: "schedule disabled" });
      continue;
    }
    if (now.getUTCDate() !== schedule.day_of_month) {
      results.push({
        site_id: siteId,
        skipped: true,
        reason: `not the configured day (today is ${now.getUTCDate()}, configured for ${schedule.day_of_month})`,
      });
      continue;
    }
    if (schedule.last_sent_period === thisMonthKey) {
      results.push({ site_id: siteId, skipped: true, reason: "already sent for this period" });
      continue;
    }

    const recipients: string[] = Array.isArray(schedule.recipients) ? schedule.recipients : [];
    if (recipients.length === 0) {
      results.push({ site_id: siteId, skipped: true, reason: "no recipients configured" });
      continue;
    }

    const result = await sendMonthlyReport({
      period_start,
      period_end,
      recipients,
      generatedByUserId: null,
      generatedByName: "Automatic Schedule",
      siteId,
      siteLabel: siteId != null ? siteLabelById.get(siteId) ?? null : null,
    });

    await supabaseAdmin
      .from("tm_report_schedule")
      .update({ last_sent_period: thisMonthKey, updated_at: new Date().toISOString() })
      .eq("id", schedule.id);

    results.push({ site_id: siteId, skipped: false, period_start, period_end, ...result });
  }

  return { results };
}
