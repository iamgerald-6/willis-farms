import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";

export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const caller = await requireUserManagementAccess(req, "edit");
    if (!caller) {
      const authed = await requireAuth(req);
      if (!authed) return jsonUnauthorized();
      return jsonForbidden();
    }

    const body = await req.json();
    const {
      target_user_id,
      updated_by,
      first_name,
      last_name,
    }: {
      target_user_id: string;
      updated_by: string;
      first_name: string;
      last_name: string;
    } = body;

    if (!target_user_id || !updated_by) {
      return NextResponse.json(
        { error: "target_user_id and updated_by are required." },
        { status: 400 },
      );
    }

    if (updated_by !== caller.id) {
      return jsonForbidden("updated_by must match the authenticated user.");
    }

    const trimmedFirst = first_name?.trim();
    const trimmedLast = last_name?.trim();
    if (!trimmedFirst || !trimmedLast) {
      return NextResponse.json(
        { error: "First name and last name are required." },
        { status: 400 },
      );
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from("users")
      .select("user_id, role")
      .eq("user_id", target_user_id)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (target.role === "super_admin") {
      return NextResponse.json(
        { error: "Super admin profile cannot be changed here." },
        { status: 403 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update({
        first_name: trimmedFirst,
        last_name: trimmedLast,
      })
      .eq("user_id", target_user_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/access-control/name]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
