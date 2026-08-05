import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export async function POST(req: NextRequest) {
  try {
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const { user_id, leave_type, reason, start_date, end_date, total_days } =
      await req.json();

    if (!user_id || !leave_type || !start_date || !end_date || !total_days) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (user_id !== caller.id && !isSeniorManagement(caller.role)) {
      return jsonForbidden("You can only submit leave for yourself.");
    }

    if (new Date(start_date) > new Date(end_date)) {
      return NextResponse.json(
        { error: "Start date cannot be after end date" },
        { status: 400 },
      );
    }

    if (leave_type === "Annual") {
      const currentYear = new Date().getFullYear();
      const { data: existing } = await supabaseAdmin
        .from("leave_requests")
        .select("total_days")
        .eq("user_id", user_id)
        .eq("leave_type", "Annual")
        .eq("status", "approved")
        .gte("start_date", `${currentYear}-01-01`)
        .lte("end_date", `${currentYear}-12-31`);

      const usedDays = existing?.reduce((sum, r) => sum + r.total_days, 0) ?? 0;
      if (usedDays + total_days > 30) {
        return NextResponse.json(
          {
            error: `You only have ${
              30 - usedDays
            } annual leave days remaining this year.`,
          },
          { status: 400 },
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .insert([
        { user_id, leave_type, reason, start_date, end_date, total_days },
      ])
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
