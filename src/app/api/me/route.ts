import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireAuth,
  jsonUnauthorized,
} from "@/lib/apiRequestAuth";
import { isSuperAdmin } from "@/lib/accessControl";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireAuth(req);
  if (!caller) return jsonUnauthorized();

  if (isSuperAdmin(caller.role)) {
    return NextResponse.json({
      user_id: caller.id,
      role: caller.role,
      is_disabled: false,
    });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id, role, is_disabled")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      user_id: caller.id,
      role: caller.role,
      is_disabled: false,
    });
  }

  return NextResponse.json({
    user_id: data.user_id,
    role: data.role,
    is_disabled: !!data.is_disabled,
  });
}
