import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";

// GET/PUT the tm_ai_usage_settings singleton row — the monthly USD budget
// for the Anthropic API and who gets emailed when it's crossed. The daily
// cron (checkAiUsageAlert.ts) reads this same row.

export async function GET(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  const { data, error } = await supabaseAdmin.from("tm_ai_usage_settings").select("*").limit(1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}

export async function PUT(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  try {
    const { enabled, monthly_budget_usd, recipients } = await req.json();

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    }
    let budget: number | null = null;
    if (monthly_budget_usd !== null && monthly_budget_usd !== undefined && monthly_budget_usd !== "") {
      budget = Number(monthly_budget_usd);
      if (!Number.isFinite(budget) || budget <= 0) {
        return NextResponse.json({ error: "monthly_budget_usd must be a positive number, or empty" }, { status: 400 });
      }
    }
    if (enabled && budget === null) {
      return NextResponse.json({ error: "Set a monthly budget before turning alerts on" }, { status: 400 });
    }
    const recips: string[] = Array.isArray(recipients) ? recipients.map((e: string) => e.trim()).filter(Boolean) : [];
    if (enabled && recips.length === 0) {
      return NextResponse.json({ error: "Add at least one recipient before turning alerts on" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin.from("tm_ai_usage_settings").select("id").limit(1).single();

    const { data, error } = await supabaseAdmin
      .from("tm_ai_usage_settings")
      .update({ enabled, monthly_budget_usd: budget, recipients: recips, updated_at: new Date().toISOString() })
      .eq("id", existing!.id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ settings: data });
  } catch (err: any) {
    console.error("[PUT /api/task-manager/ai-usage/settings]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
