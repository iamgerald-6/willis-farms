import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  fetchGroupPresetsFromDb,
  GROUP_PRESET_LABELS,
  getDefaultGroupPreset,
  isGroupPresetKey,
  type GroupPresetKey,
} from "@/lib/groupPermissionPresets";
import {
  permissionActionModuleCount,
  sanitizePermissionActions,
} from "@/lib/permissionActions";
import {
  requireUserManagementAccess,
  jsonUnauthorized,
  jsonForbidden,
  getApiRequestUser,
} from "@/lib/apiRequestAuth";

type RouteParams = { params: Promise<{ groupKey: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { groupKey } = await params;
  if (!isGroupPresetKey(groupKey)) {
    return NextResponse.json({ error: "Invalid group key." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await getApiRequestUser(req);
  if (!caller) return jsonUnauthorized();

  const { presets, rows } = await fetchGroupPresetsFromDb(supabaseAdmin);
  const row = rows.find((r) => r.group_key === groupKey) ?? {
    group_key: groupKey,
    page_permission_actions: getDefaultGroupPreset(groupKey),
    updated_at: null,
    updated_by: null,
  };

  return NextResponse.json({
    group_key: groupKey,
    label: GROUP_PRESET_LABELS[groupKey as GroupPresetKey],
    row,
    presets,
  });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { groupKey } = await params;
  if (!isGroupPresetKey(groupKey)) {
    return NextResponse.json({ error: "Invalid group key." }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireUserManagementAccess(req, "edit");
  if (!caller) {
    const authed = await requireUserManagementAccess(req, "view");
    if (!authed) return jsonUnauthorized();
    return jsonForbidden(
      "Edit access to User Management is required to change group permissions.",
    );
  }

  const body = await req.json();
  const { page_permission_actions, updated_by } = body as {
    page_permission_actions?: unknown;
    updated_by?: string;
  };

  if (!updated_by || updated_by !== caller.id) {
    return jsonForbidden("updated_by must match the authenticated user.");
  }

  const actions = sanitizePermissionActions(page_permission_actions);
  if (permissionActionModuleCount(actions) === 0) {
    return NextResponse.json(
      { error: "Select at least one module with access." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("access_group_presets")
    .upsert(
      {
        group_key: groupKey,
        page_permission_actions: actions,
        updated_at: new Date().toISOString(),
        updated_by,
      },
      { onConflict: "group_key" },
    )
    .select("group_key, page_permission_actions, updated_at, updated_by")
    .single();

  if (error) {
    const hint = error.message.includes("access_group_presets")
      ? " Run docs/access-control/group-presets.sql in Supabase first."
      : "";
    return NextResponse.json(
      { error: error.message + hint },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, data });
}
