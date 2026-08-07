import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  canManageAccessControl,
  isFullPageSet,
  isStandardEmployeePageSet,
  PAGE_PERMISSION_KEYS,
  type PagePermissionKey,
} from "@/lib/pagePermissions";
import {
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
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const body = await req.json();
    const {
      target_user_id,
      updated_by,
      page_permissions,
      is_disabled,
    }: {
      target_user_id: string;
      updated_by: string;
      page_permissions: string[];
      is_disabled?: boolean;
    } = body;

    if (!target_user_id || !updated_by || !Array.isArray(page_permissions)) {
      return NextResponse.json(
        {
          error:
            "target_user_id, updated_by, and page_permissions are required.",
        },
        { status: 400 },
      );
    }

    if (updated_by !== caller.id) {
      return jsonForbidden("updated_by must match the authenticated user.");
    }

    if (!canManageAccessControl(caller.role, caller.grade_level)) {
      return jsonForbidden();
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from("users")
      .select("user_id, role, email")
      .eq("user_id", target_user_id)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (target.role === "super_admin") {
      return NextResponse.json(
        { error: "Super admin access cannot be changed here." },
        { status: 403 },
      );
    }

    const perms = page_permissions.filter((p): p is PagePermissionKey =>
      (PAGE_PERMISSION_KEYS as readonly string[]).includes(p),
    );

    if (perms.length === 0) {
      return NextResponse.json(
        { error: "Select at least one page." },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      access_updated_at: new Date().toISOString(),
      access_updated_by: updated_by,
    };

    const currentRole = target.role as string;
    const isFullRole =
      currentRole === "admin" || currentRole === "manager";

    if (isFullPageSet(perms) && isFullRole) {
      updates.access_tier = "standard";
      updates.page_permissions = [];
    } else if (isStandardEmployeePageSet(perms) && currentRole === "employee") {
      updates.role = "employee";
      updates.access_tier = "standard";
      updates.page_permissions = [];
    } else {
      updates.role = "employee";
      updates.access_tier = "delegated";
      updates.page_permissions = perms;
    }

    if (typeof is_disabled === "boolean") {
      updates.is_disabled = is_disabled;
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("user_id", target_user_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: authUser } =
      await supabaseAdmin.auth.admin.getUserById(target_user_id);
    const existingMeta =
      (authUser?.user?.user_metadata as Record<string, unknown>) ?? {};

    const authUpdate: {
      user_metadata?: Record<string, unknown>;
      ban_duration?: string;
    } = {};

    if (typeof updates.role === "string" || typeof is_disabled === "boolean") {
      authUpdate.user_metadata = {
        ...existingMeta,
        ...(typeof updates.role === "string"
          ? { role: updates.role }
          : {}),
        ...(typeof is_disabled === "boolean" ? { is_disabled } : {}),
      };
    }

    if (typeof is_disabled === "boolean") {
      authUpdate.ban_duration = is_disabled ? "876000h" : "none";
    }

    if (Object.keys(authUpdate).length > 0) {
      await supabaseAdmin.auth.admin.updateUserById(
        target_user_id,
        authUpdate,
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/access-control]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
