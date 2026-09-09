import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { isSuperAdmin } from "@/lib/accessControl";
import { invitePlatformEmployee } from "@/lib/careers/invitePlatformEmployee";
import {
  isCoreOrgPlacementComplete,
  resolveOrgPlacementForInvite,
} from "@/lib/careers/resolveEmployeeOrgPlacement";

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
      site_id,
      business_unit_id,
      department_id,
      section_id,
      position_id,
      grade_level_id,
      user_role_id,
    } = await req.json();

    if (isSuperAdmin(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 403 });
    }

    const orgPlacement = await resolveOrgPlacementForInvite(supabaseAdmin, {
      application_id,
      site_id,
      business_unit_id,
      department_id,
      section_id,
      position_id,
      grade_level_id,
      user_role_id,
    });

    if (!application_id && !isCoreOrgPlacementComplete(orgPlacement)) {
      return NextResponse.json(
        {
          error:
            "Pick Site, Business unit, Department, Section, Position, and Grade level for a direct invite.",
        },
        { status: 400 },
      );
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
      ...orgPlacement,
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
