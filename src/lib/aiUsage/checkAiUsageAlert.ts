import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/taskManagerAuth";
import { fetchCurrentMonthSpend } from "@/lib/aiUsage/costReport";

const resend = new Resend(process.env.RESEND_API_KEY);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Called once a day by the cron job. Compares this calendar month's
 * Anthropic API spend against the configured budget and, the first time
 * spend reaches or exceeds it in a given month, emails every configured
 * recipient. Only fires once per calendar month (tracked via
 * last_alerted_period) — once you're already over budget there's no need
 * for a fresh email every single day for the rest of the month.
 *
 * Pass `force: true` to send regardless of whether the budget's actually
 * been crossed, and regardless of last_alerted_period — used by the "Send
 * test alert" button so testing doesn't require actually spending past the
 * threshold or waiting for a new month.
 */
export async function checkAiUsageAlert(options?: { force?: boolean }) {
  const { data: settings } = await supabaseAdmin.from("tm_ai_usage_settings").select("*").limit(1).single();
  if (!settings) return { skipped: true, reason: "no AI usage settings row configured" };
  if (!settings.enabled && !options?.force) return { skipped: true, reason: "AI usage alerts disabled" };
  if (settings.monthly_budget_usd === null) return { skipped: true, reason: "no monthly budget set" };

  const recipients: string[] = Array.isArray(settings.recipients) ? settings.recipients : [];
  if (recipients.length === 0) return { skipped: true, reason: "no recipients configured" };

  const spend = await fetchCurrentMonthSpend();
  if (!spend.configured) {
    return { skipped: true, reason: "ANTHROPIC_ADMIN_API_KEY is not configured on the server — see docs/task-manager/ai-usage.sql" };
  }

  const overBudget = spend.totalUsd >= settings.monthly_budget_usd;
  if (!overBudget && !options?.force) {
    return { skipped: false, alerted: false, spent: spend.totalUsd, budget: settings.monthly_budget_usd };
  }

  const now = new Date();
  const thisMonthKey = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  if (!options?.force && settings.last_alerted_period === thisMonthKey) {
    return { skipped: true, reason: "already alerted for this month" };
  }

  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://willsfarms.com"}/dashboard/taskManager/tasks`;
  const pct = Math.round((spend.totalUsd / settings.monthly_budget_usd) * 100);

  if (process.env.RESEND_API_KEY) {
    await resend.emails.send({
      from: "Wills Farms Task Manager <onboarding@resend.dev>",
      to: recipients,
      subject: `AI usage alert: ${pct}% of this month's budget used`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 560px;">
          <h2 style="color: #b91c1c;">AI usage budget alert</h2>
          <p>The Anthropic API account used for document extraction and report summaries has spent
            <strong>$${spend.totalUsd.toFixed(2)}</strong> so far in ${spend.periodStart.slice(0, 7)},
            against a monthly budget of <strong>$${settings.monthly_budget_usd.toFixed(2)}</strong> (${pct}%).</p>
          <p>Check current usage and adjust the budget from Automation settings:</p>
          <p><a href="${dashboardUrl}" style="color:#b91c1c;">${dashboardUrl}</a></p>
        </div>
      `,
    });
  } else {
    console.warn(`[checkAiUsageAlert] RESEND_API_KEY not set — would have emailed ${recipients.join(", ")} (spent $${spend.totalUsd.toFixed(2)} of $${settings.monthly_budget_usd.toFixed(2)}).`);
  }

  if (!options?.force) {
    await supabaseAdmin.from("tm_ai_usage_settings").update({ last_alerted_period: thisMonthKey, updated_at: new Date().toISOString() }).eq("id", settings.id);
  }

  return { skipped: false, alerted: true, spent: spend.totalUsd, budget: settings.monthly_budget_usd };
}
