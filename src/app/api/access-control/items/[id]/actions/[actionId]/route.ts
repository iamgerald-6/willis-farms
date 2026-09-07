import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

/** DELETE — remove one action from an Access control item. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> },
) {
  try {
    const { id, actionId } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to remove an action.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { error } = await supabase
      .from("access_control_item_actions")
      .delete()
      .eq("id", actionId)
      .eq("access_control_item_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
