import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";

// GET/PUT the tm_report_schedule singleton row — automatic monthly report
// config (on/off, which day of the month, who it goes to). The cron job
// (src/lib/reports/scheduledReportRunner.ts) reads this same row.

export async function GET(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  const { data, error } = await supabaseAdmin.from("tm_report_schedule").select("*").limit(1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ schedule: data });
}

export async function PUT(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  try {
    const { enabled, day_of_month, recipients } = await req.json();

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    }
    const day = Number(day_of_month);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      return NextResponse.json({ error: "day_of_month must be an integer between 1 and 28" }, { status: 400 });
    }
    const emails: string[] = Array.isArray(recipients) ? recipients.map((e: string) => e.trim()).filter(Boolean) : [];
    if (enabled && emails.length === 0) {
      return NextResponse.json({ error: "Add at least one recipient before enabling the schedule" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin.from("tm_report_schedule").select("id").limit(1).single();

    const { data, error } = await supabaseAdmin
      .from("tm_report_schedule")
      .update({ enabled, day_of_month: day, recipients: emails, updated_at: new Date().toISOString() })
      .eq("id", existing!.id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ schedule: data });
  } catch (err: any) {
    console.error("[PUT /api/task-manager/reports/schedule]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
