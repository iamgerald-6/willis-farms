import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  canManageAccessControl,
  PAGE_PERMISSION_KEYS,
  type PagePermissionKey,
} from "@/lib/pagePermissions";
import {
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";

const VALID_ROLES = new Set(["employee", "manager", "admin"]);

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
      access_mode,
      role,
      grade_level,
      page_permissions,
    }: {
      target_user_id: string;
      updated_by: string;
      access_mode: "standard" | "full" | "delegated";
      role?: string;
      grade_level?: string;
      page_permissions?: string[];
    } = body;

    if (!target_user_id || !updated_by || !access_mode) {
      return NextResponse.json(
        { error: "target_user_id, updated_by, and access_mode are required." },
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

    const updates: Record<string, unknown> = {
      access_updated_at: new Date().toISOString(),
      access_updated_by: updated_by,
    };

    if (access_mode === "full") {
      if (!role || !VALID_ROLES.has(role)) {
        return NextResponse.json(
          { error: "Valid role (employee, manager, admin) is required for full access." },
          { status: 400 },
        );
      }
      updates.role = role;
      updates.access_tier = "standard";
      updates.page_permissions = [];
      if (grade_level) updates.grade_level = grade_level;
    } else if (access_mode === "delegated") {
      const perms = (page_permissions ?? []).filter((p): p is PagePermissionKey =>
        (PAGE_PERMISSION_KEYS as readonly string[]).includes(p),
      );
      if (perms.length === 0) {
        return NextResponse.json(
          { error: "Select at least one page for delegated access." },
          { status: 400 },
        );
      }
      updates.role = "employee";
      updates.access_tier = "delegated";
      updates.page_permissions = perms;
    } else {
      updates.role = role && VALID_ROLES.has(role) ? role : "employee";
      updates.access_tier = "standard";
      updates.page_permissions = [];
      if (grade_level) updates.grade_level = grade_level;
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

    // Sync auth metadata role for JWT/session hints
    if (typeof updates.role === "string") {
      await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
        user_metadata: { role: updates.role },
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/access-control]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
