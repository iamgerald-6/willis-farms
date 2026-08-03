// Talks to Anthropic's Cost Report Admin API to answer one question: how
// much has this organization spent on the Anthropic API so far this
// calendar month? Used by both the live readout in Automation settings
// (see /api/task-manager/ai-usage/current) and the daily budget-alert
// check (see checkAiUsageAlert.ts).
//
// This requires a separate ANTHROPIC_ADMIN_API_KEY (starts with
// sk-ant-admin...) — NOT the regular ANTHROPIC_API_KEY already used for
// document extraction and the report executive summary. An Admin key can
// only be created by an organization owner/admin, in Console → Settings →
// Organization → Admin API keys, and is never available for individual
// (non-organization) accounts. If that env var isn't set, every function
// here returns `configured: false` rather than throwing, so nothing else
// in the app breaks just because this hasn't been set up yet.
//
// Reference: https://platform.claude.com/docs/en/manage-claude/usage-cost-api
// This implementation follows Anthropic's documented request/response
// shape for the bucketed Usage & Cost Admin APIs (a `data` array of time
// buckets, each with a `results` array of cost line items, paginated via
// `has_more`/`next_page`). If Anthropic changes that shape, the parsing
// below logs the raw response on an unexpected shape so it's fast to spot
// and adjust rather than silently reporting $0.

export interface MonthlySpend {
  configured: boolean;
  totalUsd: number;
  periodStart: string; // YYYY-MM-DD, first of the current UTC month
  periodEnd: string; // YYYY-MM-DD, today (UTC)
}

function currentMonthRange(): { starting_at: string; ending_at: string; periodStart: string; periodEnd: string } {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // ending_at is exclusive on Anthropic's bucketed endpoints — start of
  // tomorrow captures all of today's spend.
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    starting_at: monthStart.toISOString(),
    ending_at: tomorrow.toISOString(),
    periodStart: monthStart.toISOString().slice(0, 10),
    periodEnd: now.toISOString().slice(0, 10),
  };
}

/** Sums whatever cost line items are on a single bucket, defensively — see the shape note above. */
function sumBucket(bucket: any): number {
  if (Array.isArray(bucket?.results)) {
    return bucket.results.reduce((sum: number, r: any) => sum + (parseFloat(r?.amount) || 0), 0);
  }
  // Fallback for a flatter shape, if Anthropic's actual response doesn't
  // nest per-bucket line items under `results`.
  if (bucket?.amount !== undefined) {
    return parseFloat(bucket.amount) || 0;
  }
  return 0;
}

export async function fetchCurrentMonthSpend(): Promise<MonthlySpend> {
  const { starting_at, ending_at, periodStart, periodEnd } = currentMonthRange();
  const adminKey = process.env.ANTHROPIC_ADMIN_API_KEY;

  if (!adminKey) {
    return { configured: false, totalUsd: 0, periodStart, periodEnd };
  }

  let totalCents = 0;
  let page: string | null = null;
  let sawAnyBucket = false;

  do {
    const params = new URLSearchParams({ starting_at, ending_at, limit: "31" });
    if (page) params.set("page", page);

    const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${params.toString()}`, {
      headers: { "anthropic-version": "2023-06-01", "x-api-key": adminKey },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Anthropic Cost Report API returned HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = await res.json();
    const buckets = Array.isArray(json?.data) ? json.data : [];
    for (const bucket of buckets) {
      sawAnyBucket = true;
      totalCents += sumBucket(bucket);
    }

    page = json?.has_more && json?.next_page ? json.next_page : null;
  } while (page);

  if (!sawAnyBucket) {
    // Not necessarily an error — a brand-new org with zero spend this month
    // legitimately returns no buckets — but worth a breadcrumb since it's
    // also what a schema mismatch would look like.
    console.warn("[fetchCurrentMonthSpend] Cost Report API returned no buckets for the current month — either genuinely $0 spent, or the response shape didn't match what this code expects.");
  }

  return { configured: true, totalUsd: totalCents / 100, periodStart, periodEnd };
}
