import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchUserRoleLabelMap } from "@/lib/userRoleAccessControl";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const { data, error } = await supabaseAdmin.from("users").select("*");

    if (error) {
      return NextResponse.json([], { status: 400 });
    }

    // Attach each user's resolved "User role" label (Standard, Executive,
    // Supervisory, ...) so client pages can build access decisions off the
    // new role system without each one re-resolving the dynamic list table
    // themselves — see userRoleAccessControl.ts. Empty map (list not
    // created yet, or nobody migrated) just means every user_role_label
    // comes back null, and callers fall back to the old role/grade fields.
    const roleLabels = await fetchUserRoleLabelMap(supabaseAdmin);
    const withRoleLabels = (data ?? []).map((row) => ({
      ...row,
      user_role_label: row.user_role_id ? roleLabels.get(row.user_role_id) ?? null : null,
    }));

    return NextResponse.json(withRoleLabels);
  } catch (err) {
    return NextResponse.json([], { status: 500 });
  }
}
