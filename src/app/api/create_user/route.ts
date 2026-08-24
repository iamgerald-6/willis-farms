import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import {
  buildInviteEmail,
  sendViaResend,
} from "@/lib/email/resendClient";
import { getAppBaseUrl } from "@/lib/appUrl";
import { isSuperAdmin } from "@/lib/accessControl";
import { fetchGradeLevelsConfig } from "@/lib/grades/fetchGradeLevelsConfig";
import { canAssignAsSupervisor } from "@/lib/supervisorAssignment";

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
      role,
      phone,
      first_name,
      last_name,
      company_id,
      job_position,
      grade_level,
      supervisor_id,
    } = await req.json();

    if (!email || !role || !first_name || !last_name || !company_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (isSuperAdmin(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 403 });
    }

    const validRoles = ["admin", "manager", "employee"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const gradeConfig = await fetchGradeLevelsConfig(supabaseAdmin);
    let resolvedSupervisorId: string | null = null;

    if (supervisor_id) {
      const { data: supervisor, error: supervisorError } = await supabaseAdmin
        .from("users")
        .select("user_id, role, grade_level")
        .eq("user_id", String(supervisor_id).trim())
        .maybeSingle();

      if (supervisorError || !supervisor) {
        return NextResponse.json(
          { error: "Supervisor not found" },
          { status: 404 },
        );
      }

      const employeeStub = {
        user_id: "pending",
        role,
        grade_level: grade_level ?? null,
      };

      if (!canAssignAsSupervisor(supervisor, employeeStub, gradeConfig)) {
        return NextResponse.json(
          {
            error:
              "Invalid supervisor — must be L4 or above and strictly senior to the employee's grade.",
          },
          { status: 400 },
        );
      }

      resolvedSupervisorId = supervisor.user_id;
    }

    const redirectTo = `${getAppBaseUrl()}/set-password`;

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo,
          data: { role },
        },
      });

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 400 });
    }

    const authUser = linkData.user;
    const actionLink = linkData.properties?.action_link;

    if (!authUser?.id || !actionLink) {
      return NextResponse.json(
        { error: "Could not create invite link." },
        { status: 500 },
      );
    }

    const baseRow = {
      user_id: authUser.id,
      email,
      phone: phone ?? null,
      role,
      first_name,
      last_name,
      company_id,
      grade_level,
      job_position: job_position ?? null,
      supervisor_id: resolvedSupervisorId,
      created_at: new Date().toISOString(),
    };

    // Try full row first (audit + setup flags). Fall back if optional
    // columns are missing from the DB / schema cache hasn't been reloaded.
    const insertAttempts: Record<string, unknown>[] = [
      {
        ...baseRow,
        created_by: caller.id,
        email_verified: false,
        email_confirm: false,
      },
      { ...baseRow, email_verified: false, email_confirm: false },
      { ...baseRow },
      {
        ...baseRow,
        supervisor_id: undefined,
        created_by: caller.id,
        email_verified: false,
        email_confirm: false,
      },
      {
        ...baseRow,
        supervisor_id: undefined,
        email_verified: false,
        email_confirm: false,
      },
      { ...baseRow, supervisor_id: undefined },
    ];

    let tableUser = null;
    let tableError: { message: string } | null = null;

    for (const row of insertAttempts) {
      const result = await supabaseAdmin
        .from("users")
        .insert([row])
        .select()
        .single();

      if (!result.error) {
        tableUser = result.data;
        tableError = null;
        break;
      }

      tableError = result.error;
      const msg = result.error.message.toLowerCase();
      const missingOptionalColumn =
        msg.includes("created_by") ||
        msg.includes("email_verified") ||
        msg.includes("email_confirm") ||
        msg.includes("supervisor_id") ||
        msg.includes("schema cache");

      if (!missingOptionalColumn) break;
    }

    if (tableError || !tableUser) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      const hint = tableError?.message?.includes("created_by")
        ? " Run in Supabase SQL: ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by uuid; NOTIFY pgrst, 'reload schema';"
        : "";
      return NextResponse.json(
        { error: (tableError?.message ?? "Could not create user.") + hint },
        { status: 400 },
      );
    }

    const mail = buildInviteEmail(actionLink, first_name);
    const sendResult = await sendViaResend({
      to: email,
      ...mail,
    });

    if (!sendResult.sent) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      await supabaseAdmin.from("users").delete().eq("user_id", authUser.id);
      return NextResponse.json(
        { error: sendResult.error ?? "Failed to send invite email." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: tableUser });
  } catch (err) {
    console.error("[POST /api/create_user]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
