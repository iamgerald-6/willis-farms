import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { isSuperAdmin } from "@/lib/accessControl";
import { fetchGradeLevelsConfig } from "@/lib/grades/fetchGradeLevelsConfig";
import { canAssignAsSupervisor } from "@/lib/supervisorAssignment";
import {
  isMissingColumnError,
  updateUserWithColumnFallback,
} from "@/lib/supabaseUserUpdate";

const SUPERVISOR_MIGRATION_HINT =
  " Run docs/access-control/users-supervisor.sql in Supabase, then: NOTIFY pgrst, 'reload schema';";

function isSupervisorColumnError(message: string): boolean {
  const msg = message.toLowerCase();
  return isMissingColumnError(message) || msg.includes("supervisor_id");
}

export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireUserManagementAccess(req, "edit");
  if (!caller) {
    return jsonForbidden(
      "Forbidden — User Management edit access required.",
    );
  }

  try {
    const body = await req.json();
    const target_user_id = String(body.target_user_id ?? "").trim();
    const supervisor_id =
      body.supervisor_id == null || body.supervisor_id === ""
        ? null
        : String(body.supervisor_id).trim();

    if (!target_user_id) {
      return NextResponse.json(
        { error: "target_user_id is required" },
        { status: 400 },
      );
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from("users")
      .select("user_id, role, grade_level")
      .eq("user_id", target_user_id)
      .maybeSingle();

    if (targetError) {
      if (isSupervisorColumnError(targetError.message)) {
        return NextResponse.json(
          { error: `supervisor_id column is missing.${SUPERVISOR_MIGRATION_HINT}` },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: targetError.message }, { status: 500 });
    }

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (isSuperAdmin(target.role)) {
      return NextResponse.json(
        { error: "Cannot assign a supervisor to this account." },
        { status: 403 },
      );
    }

    if (supervisor_id === target_user_id) {
      return NextResponse.json(
        { error: "A user cannot be their own supervisor." },
        { status: 400 },
      );
    }

    const gradeConfig = await fetchGradeLevelsConfig(supabaseAdmin);

    if (supervisor_id) {
      const { data: supervisor, error: supervisorError } = await supabaseAdmin
        .from("users")
        .select("user_id, role, grade_level")
        .eq("user_id", supervisor_id)
        .maybeSingle();

      if (supervisorError || !supervisor) {
        return NextResponse.json(
          { error: "Supervisor not found" },
          { status: 404 },
        );
      }

      if (
        !canAssignAsSupervisor(supervisor, target, gradeConfig)
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid supervisor — must be L4 or above and strictly senior to the employee's grade.",
          },
          { status: 400 },
        );
      }
    }

    const { data, error } = await updateUserWithColumnFallback(
      supabaseAdmin,
      target_user_id,
      { supervisor_id },
    );

    if (error) {
      if (isSupervisorColumnError(error.message)) {
        return NextResponse.json(
          { error: `supervisor_id column is missing.${SUPERVISOR_MIGRATION_HINT}` },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        user_id: data?.user_id ?? target_user_id,
        supervisor_id: data?.supervisor_id ?? supervisor_id,
      },
    });
  } catch (err) {
    console.error("[PATCH /api/access-control/supervisor]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
