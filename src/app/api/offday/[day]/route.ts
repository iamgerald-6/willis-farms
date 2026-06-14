import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ day: string }> },
) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const { user_id } = await req.json();
    const { day: dayParam } = await params;
    const day = parseInt(dayParam, 10);

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 },
      );
    }
    if (isNaN(day) || day < 0 || day > 6) {
      return NextResponse.json(
        { error: "day param must be 0–6" },
        { status: 400 },
      );
    }

    // Only delete the most recent row for this user+day
    // so historical records remain intact
    const { data: existing } = await supabaseAdmin
      .from("off_days")
      .select("id")
      .eq("user_id", user_id)
      .eq("day_of_week", day)
      .order("effective_from", { ascending: false })
      .limit(1)
      .single();

    if (!existing) {
      return NextResponse.json({ success: true, message: "Nothing to delete" });
    }

    const { error } = await supabaseAdmin
      .from("off_days")
      .delete()
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Off day removed" });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
