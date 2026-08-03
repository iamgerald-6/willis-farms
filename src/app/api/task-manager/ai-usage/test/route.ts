import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement } from "@/lib/taskManagerAuth";
import { checkAiUsageAlert } from "@/lib/aiUsage/checkAiUsageAlert";

// POST /api/task-manager/ai-usage/test — lets Senior Management send the
// budget-alert email on demand, with force: true so it goes out regardless
// of whether the budget's actually been crossed or already alerted this
// month — useful for confirming recipients/wording are right without
// waiting to actually go over budget.
export async function POST(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  try {
    const result = await checkAiUsageAlert({ force: true });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[POST /api/task-manager/ai-usage/test]", err);
    return NextResponse.json({ error: err.message ?? "Failed to send test alert" }, { status: 500 });
  }
}
