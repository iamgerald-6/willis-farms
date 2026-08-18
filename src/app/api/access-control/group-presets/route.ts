import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  fetchGroupPresetsFromDb,
  GROUP_PRESET_KEYS,
  getDefaultGroupPreset,
  type GroupPresetKey,
} from "@/lib/groupPermissionPresets";
import { requireUserManagementAccess, jsonUnauthorized, getApiRequestUser } from "@/lib/apiRequestAuth";

export async function GET(req: NextRequest) {
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

  const fullRows = GROUP_PRESET_KEYS.map((key) => {
    const existing = rows.find((r) => r.group_key === key);
    if (existing) return existing;
    return {
      group_key: key,
      page_permission_actions: getDefaultGroupPreset(key),
      updated_at: null,
      updated_by: null,
    };
  });

  return NextResponse.json({ presets, rows: fullRows });
}
