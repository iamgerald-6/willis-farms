// app/api/leave/all/route.ts — admin only
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .select(
        `
        *,
        users!leave_requests_user_id_fkey (
          email,
          first_name,
          last_name,
          role
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
