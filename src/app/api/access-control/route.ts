import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  PAGE_PERMISSION_KEYS,
  type PagePermissionKey,
} from "@/lib/pagePermissions";
import {
  actionsToLegacyPageKeys,
  actionsToLevels,
  isStandardEmployeeActionSet,
  levelsToActions,
  permissionActionSetsEqual,
  sanitizePermissionActions,
} from "@/lib/permissionActions";
import { fetchGroupPresetsFromDb, resolveGroupPresetActions } from "@/lib/groupPermissionPresets";
import { sanitizePermissionLevels } from "@/lib/permissionLevels";
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
import { isSuperAdmin } from "@/lib/accessControl";

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
      page_permission_actions,
      is_disabled,
      reset_to_group,
    }: {
      target_user_id: string;
      updated_by: string;
      page_permissions?: string[];
      page_permission_levels?: unknown;
      page_permission_actions?: unknown;
      is_disabled?: boolean;
      reset_to_group?: boolean;
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
      .select("user_id, role, email, grade_level")
      .eq("user_id", target_user_id)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (target_user_id === caller.id && is_disabled === true) {
      return jsonForbidden("You cannot disable your own account.");
    }

    if (isSuperAdmin(target.role)) {
      return NextResponse.json(
        { error: "Super admin access cannot be changed here." },
        { status: 403 },
      );
    }

    if (reset_to_group === true) {
      const updates: Record<string, unknown> = {
        access_updated_at: new Date().toISOString(),
        access_updated_by: updated_by,
        access_tier: "standard",
        page_permissions: [],
        page_permission_levels: {},
        page_permission_actions: {},
      };
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

      return NextResponse.json({ success: true, data });
    }

    let actions = sanitizePermissionActions(page_permission_actions);

    if (Object.keys(actions).length === 0) {
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

      if (Object.keys(levels).length > 0) {
        actions = levelsToActions(levels);
      }
    }

    const levels = actionsToLevels(actions);
    const perms = actionsToLegacyPageKeys(actions);

    if (perms.length === 0) {
      return NextResponse.json(
        { error: "Select at least one module with access." },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      access_updated_at: new Date().toISOString(),
      access_updated_by: updated_by,
      page_permission_actions: actions,
      page_permission_levels: levels,
    };

    const currentRole = target.role as string;
    const { presets: groupPresets } = await fetchGroupPresetsFromDb(supabaseAdmin);
    const groupActions = resolveGroupPresetActions(
      { role: target.role, grade_level: target.grade_level },
      groupPresets,
    );
    const matchesGroupPreset =
      Object.keys(groupActions).length > 0 &&
      permissionActionSetsEqual(actions, groupActions);

    if (matchesGroupPreset) {
      updates.access_tier = "standard";
      updates.page_permissions = [];
      updates.page_permission_levels = {};
      updates.page_permission_actions = {};
    } else if (
      isStandardEmployeeActionSet(actions) &&
      currentRole === "employee"
    ) {
      updates.role = "employee";
      updates.access_tier = "standard";
      updates.page_permissions = [];
      updates.page_permission_levels = {};
      updates.page_permission_actions = {};
    } else {
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
