import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

/** DELETE — remove a Site set up mapping row. Cascades to anything mapped underneath it (Business unit set up rows for this site+business-unit pair, and so on down the chain). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden("System Definitions edit access is required.");
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { error } = await supabase.from("org_site_business_units").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
