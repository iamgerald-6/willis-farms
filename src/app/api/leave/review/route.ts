import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireSeniorManagement,
  jsonForbidden,
} from "@/lib/apiRequestAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireSeniorManagement(req);
    if (!caller) {
      return jsonForbidden(
        "Forbidden — admin, manager, or super_admin access required.",
      );
    }

    const { leave_id, status, admin_note, reviewed_by } = await req.json();

    if (!leave_id || !status || !reviewed_by) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (reviewed_by !== caller.id) {
      return jsonForbidden("reviewed_by must match the authenticated user.");
    }

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .update({
        status,
        admin_note: admin_note ?? null,
        reviewed_by,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", leave_id)
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
