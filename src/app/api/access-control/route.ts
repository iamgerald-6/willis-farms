import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  isStandardEmployeePageSet,
  PAGE_PERMISSION_KEYS,
  type PagePermissionKey,
} from "@/lib/pagePermissions";
import {
  levelsToLegacyPageKeys,
  sanitizePermissionLevels,
} from "@/lib/permissionLevels";
import {
  requireUserManagementAccess,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import {
  ACCESS_CONTROL_MIGRATION_HINT,
  isMissingColumnError,
  updateUserWithColumnFallback,
} from "@/lib/supabaseUserUpdate";

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
      const authed = await requireUserManagementAccess(req, "view");
      if (!authed) return jsonUnauthorized();
      return jsonForbidden(
        "Edit access to User Management is required to change permissions.",
      );
    }

    const body = await req.json();
    const {
      target_user_id,
      updated_by,
      page_permissions,
      page_permission_levels,
      is_disabled,
    }: {
      target_user_id: string;
      updated_by: string;
      page_permissions?: string[];
      page_permission_levels?: unknown;
      is_disabled?: boolean;
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

    const { data: target, error: targetError } = await supabaseAdmin
      .from("users")
      .select("user_id, role, email")
      .eq("user_id", target_user_id)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (target_user_id === caller.id && is_disabled === true) {
      return jsonForbidden("You cannot disable your own account.");
    }

    if (target.role === "super_admin") {
      return NextResponse.json(
        { error: "Super admin access cannot be changed here." },
        { status: 403 },
      );
    }

    let levels = sanitizePermissionLevels(page_permission_levels);

    if (
      Object.keys(levels).length === 0 &&
      Array.isArray(page_permissions)
    ) {
      for (const p of page_permissions) {
        if ((PAGE_PERMISSION_KEYS as readonly string[]).includes(p)) {
          levels[p as PagePermissionKey] = "view";
        }
      }
    }

    const perms = levelsToLegacyPageKeys(levels);

    if (perms.length === 0) {
      return NextResponse.json(
        { error: "Select at least one page with access." },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      access_updated_at: new Date().toISOString(),
      access_updated_by: updated_by,
      page_permission_levels: levels,
    };

    const currentRole = target.role as string;
    const isFullRole =
      currentRole === "admin" || currentRole === "manager";

    if (isFullRole) {
      // Admin/Manager keep their role here — this screen only ever converts
      // an *employee* into a delegated sub-admin. If every key is "edit"
      // they're back to the plain full-role default; otherwise store the
      // customized levels (e.g. Admin granted "edit" on Users) without
      // touching role.
      const allEdit = PAGE_PERMISSION_KEYS.every((k) => levels[k] === "edit");
      if (allEdit) {
        updates.access_tier = "standard";
        updates.page_permissions = [];
        updates.page_permission_levels = {};
      } else {
        updates.access_tier = "delegated";
        updates.page_permissions = perms;
      }
    } else if (isStandardEmployeePageSet(perms) && currentRole === "employee") {
      const allView = perms.every(
        (k) => !levels[k] || levels[k] === "view",
      );
      if (allView) {
        updates.role = "employee";
        updates.access_tier = "standard";
        updates.page_permissions = [];
        updates.page_permission_levels = {};
      } else {
        updates.role = "employee";
        updates.access_tier = "delegated";
        updates.page_permissions = perms;
      }
    } else {
      updates.role = "employee";
      updates.access_tier = "delegated";
      updates.page_permissions = perms;
    }

    if (typeof is_disabled === "boolean") {
      updates.is_disabled = is_disabled;
    }

    const { data, error } = await updateUserWithColumnFallback(
      supabaseAdmin,
      target_user_id,
      updates,
    );

    if (error) {
      const hint = isMissingColumnError(error.message)
        ? ACCESS_CONTROL_MIGRATION_HINT
        : "";
      return NextResponse.json(
        { error: error.message + hint },
        { status: 500 },
      );
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
