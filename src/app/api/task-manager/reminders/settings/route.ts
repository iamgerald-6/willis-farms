import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";

// GET/PUT the tm_reminder_settings singleton row — deadline reminder config
// (on/off, how many days before due date the heads-up email goes out). The
// cron job (src/lib/reminders/sendReminders.ts) reads this same row; the
// "everyday at 9am while overdue" part isn't configurable here — it's just
// what the daily cron does once a task is past its due date.

export async function GET(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  const { data, error } = await supabaseAdmin.from("tm_reminder_settings").select("*").limit(1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}

export async function PUT(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  try {
    const { enabled, days_before_due, cc_recipients } = await req.json();

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    }
    const days = Number(days_before_due);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      return NextResponse.json({ error: "days_before_due must be an integer between 1 and 30" }, { status: 400 });
    }
    const cc: string[] = Array.isArray(cc_recipients) ? cc_recipients.map((e: string) => e.trim()).filter(Boolean) : [];

    const { data: existing } = await supabaseAdmin.from("tm_reminder_settings").select("id").limit(1).single();

    const { data, error } = await supabaseAdmin
      .from("tm_reminder_settings")
      .update({ enabled, days_before_due: days, cc_recipients: cc, updated_at: new Date().toISOString() })
      .eq("id", existing!.id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ settings: data });
  } catch (err: any) {
    console.error("[PUT /api/task-manager/reminders/settings]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
