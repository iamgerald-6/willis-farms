import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const { user_id, day_of_week } = await req.json();

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 },
      );
    }
    if (day_of_week === undefined || day_of_week < 0 || day_of_week > 6) {
      return NextResponse.json(
        { error: "day_of_week must be 0–6" },
        { status: 400 },
      );
    }

    // Always INSERT a new row — never update the old one.
    // effective_from defaults to today in the DB so history is preserved.
    const { data, error } = await supabaseAdmin
      .from("off_days")
      .insert({ user_id, day_of_week })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
