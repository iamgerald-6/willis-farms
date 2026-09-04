import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { ORG_STRUCTURE_LISTS, isOrgStructureListKey } from "@/lib/organizationalStructure";

/**
 * PATCH — edit an existing row. Label, region (Sites only), notes, and
 * is_active can be changed. `code` is intentionally left alone here — it's
 * only ever derived from the label at creation time (see the POST route),
 * so it stays a stable identifier even if the label is later renamed.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ list: string; id: string }> },
) {
  try {
    const { list, id } = await params;
    if (!isOrgStructureListKey(list)) {
      return NextResponse.json({ error: "Unknown list" }, { status: 404 });
    }

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to edit this list.",
      );
    }

    const config = ORG_STRUCTURE_LISTS[list];
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (!label) {
        return NextResponse.json({ error: "Label cannot be empty" }, { status: 400 });
      }
      updates.label = label;
    }
    if (config.hasRegion && typeof body.region !== "undefined") {
      updates.region = (body.region as string | undefined)?.trim() || null;
    }
    if (typeof body.notes !== "undefined") {
      updates.notes = (body.notes as string | undefined)?.trim() || null;
    }
    if (typeof body.is_active === "boolean") {
      updates.is_active = body.is_active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data, error } = await supabase
      .from(config.table)
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — permanently remove a row. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ list: string; id: string }> },
) {
  try {
    const { list, id } = await params;
    if (!isOrgStructureListKey(list)) {
      return NextResponse.json({ error: "Unknown list" }, { status: 404 });
    }

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to delete from this list.",
      );
    }

    const config = ORG_STRUCTURE_LISTS[list];
    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { error } = await supabase.from(config.table).delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
