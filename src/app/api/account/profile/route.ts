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

  if (caller.authOnly && isSuperAdmin(caller.role)) {
    return NextResponse.json({
      user_id: caller.id,
      email: caller.email,
      first_name: null,
      last_name: null,
      role: caller.role,
      grade_level: null,
      job_position: null,
      phone: null,
      company_id: null,
      auth_only: true,
    });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(
      "user_id, email, first_name, last_name, role, grade_level, job_position, phone, company_id",
    )
    .eq("user_id", caller.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      user_id: caller.id,
      email: caller.email,
      first_name: null,
      last_name: null,
      role: caller.role,
      grade_level: caller.grade_level,
      job_position: null,
      phone: null,
      company_id: caller.company_id,
      auth_only: true,
    });
  }

  return NextResponse.json({ ...data, auth_only: false });
}

export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireAuth(req);
  if (!caller) return jsonUnauthorized();

  if (caller.authOnly || isSuperAdmin(caller.role)) {
    return NextResponse.json(
      { error: "This profile cannot be updated here." },
      { status: 403 },
    );
  }

  try {
    const { first_name, last_name } = await req.json();
    const trimmedFirst = first_name?.trim();
    const trimmedLast = last_name?.trim();

    if (!trimmedFirst || !trimmedLast) {
      return NextResponse.json(
        { error: "First name and last name are required." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update({
        first_name: trimmedFirst,
        last_name: trimmedLast,
      })
      .eq("user_id", caller.id)
      .select(
        "user_id, email, first_name, last_name, role, grade_level, job_position, phone, company_id",
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/account/profile]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
