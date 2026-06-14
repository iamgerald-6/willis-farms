import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");
    const target_date = searchParams.get("date");

    let query = supabaseAdmin
      .from("off_days")
      .select("*")
      .order("effective_from", { ascending: false });

    // Filter by user if provided
    if (user_id) {
      query = query.eq("user_id", user_id);
    }

    // Filter by date if provided — only rows effective on or before that date
    if (target_date) {
      query = query.lte("effective_from", target_date);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If a date is provided, return only the most recent row per (user_id, day_of_week).
    // A user can have multiple off days (e.g. Saturday AND Monday).
    // The data is already ordered by effective_from DESC so the first hit per key wins.
    if (target_date && data) {
      const latestPerKey = new Map<string, any>();
      data.forEach((row) => {
        const key = `${row.user_id}:${row.day_of_week}`;
        if (!latestPerKey.has(key)) {
          latestPerKey.set(key, row);
        }
      });
      return NextResponse.json({ data: Array.from(latestPerKey.values()) });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
