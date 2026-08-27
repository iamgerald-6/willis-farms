import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { isSuperAdmin } from "@/lib/accessControl";
import { invitePlatformEmployee } from "@/lib/careers/invitePlatformEmployee";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireUserManagementAccess(req, "add");
  if (!caller) {
    return jsonForbidden(
      "Forbidden — User Management add or edit access required.",
    );
  }

  try {
    const {
      email,
      invite_delivery_email,
      role,
      phone,
      first_name,
      last_name,
      company_id,
      job_position,
      grade_level,
      supervisor_id,
      application_id,
    } = await req.json();

    if (isSuperAdmin(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 403 });
    }

    const result = await invitePlatformEmployee(supabaseAdmin, {
      email,
      invite_delivery_email,
      role,
      phone,
      first_name,
      last_name,
      company_id,
      job_position,
      grade_level,
      supervisor_id,
      application_id,
      created_by: caller.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 },
      );
    }

    return NextResponse.json({ data: result.user });
  } catch (err) {
    console.error("[POST /api/create_user]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
