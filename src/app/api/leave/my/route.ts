// app/api/leave/my/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const currentYear = new Date().getFullYear();

    // Fetch all leave requests for this user
    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Calculate used annual leave days this year
    const usedDays =
      data
        ?.filter(
          (r) =>
            r.leave_type === "Annual" &&
            r.status === "approved" &&
            new Date(r.start_date).getFullYear() === currentYear
        )
        .reduce((sum, r) => sum + r.total_days, 0) ?? 0;

    return NextResponse.json({
      data,
      balance: {
        total: 30,
        used: usedDays,
        remaining: 30 - usedDays,
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
