import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";
import { fetchCurrentMonthSpend } from "@/lib/aiUsage/costReport";

// GET /api/task-manager/ai-usage/current — live spend-vs-budget readout for
// the Automation settings panel. Talks to Anthropic on every request (no
// caching) since this is only ever loaded while that settings section is
// open, not polled continuously.
export async function GET(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  try {
    const spend = await fetchCurrentMonthSpend();
    const { data: settings } = await supabaseAdmin.from("tm_ai_usage_settings").select("monthly_budget_usd").limit(1).single();

    return NextResponse.json({
      ...spend,
      monthly_budget_usd: settings?.monthly_budget_usd ?? null,
    });
  } catch (err: any) {
    console.error("[GET /api/task-manager/ai-usage/current]", err);
    return NextResponse.json({ error: err.message ?? "Couldn't reach the Anthropic Cost Report API" }, { status: 500 });
  }
}
