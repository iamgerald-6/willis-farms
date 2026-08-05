import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSeniorManagement, jsonForbidden } from "@/lib/apiRequestAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  try {
    const caller = await requireSeniorManagement(req);
    if (!caller) {
      return jsonForbidden(
        "Forbidden — admin, manager, or super_admin access required.",
      );
    }

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
      `,
      )
      .order("created_at", { ascending: false });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
