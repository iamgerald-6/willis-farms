import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import type { CustomFieldDef, OrgCustomListType } from "@/lib/organizationalStructureCustomLists";

function extraColumnValues(
  input: unknown,
  fields: CustomFieldDef[],
): Record<string, string | number | boolean | null> {
  const values: Record<string, string | number | boolean | null> = {};
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  for (const field of fields) {
    const value = raw[field.key];
    if (value === undefined || value === null || value === "") {
      values[field.key] = null;
      continue;
    }
    if (field.type === "number") {
      const num = Number(value);
      values[field.key] = Number.isFinite(num) ? num : null;
    } else if (field.type === "boolean") {
      values[field.key] = value === true;
    } else {
      values[field.key] = String(value);
    }
  }
  return values;
}

/** PATCH — edit an existing item in a custom list's own table. `code` is left alone, same as the fixed lists. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id, itemId } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to edit this list.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data: listType, error: listTypeError } = await supabase
      .from("org_custom_list_types")
      .select("*")
      .eq("id", id)
      .single();

    if (listTypeError || !listType) {
      return NextResponse.json({ error: "Unknown list" }, { status: 404 });
    }
    const config = listType as OrgCustomListType;

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (!label) {
        return NextResponse.json({ error: "Label cannot be empty" }, { status: 400 });
      }
      updates.label = label;
    }
    if (config.has_region && typeof body.region !== "undefined") {
      updates.region = (body.region as string | undefined)?.trim() || null;
    }
    if (typeof body.notes !== "undefined") {
      updates.notes = (body.notes as string | undefined)?.trim() || null;
    }
    if (typeof body.is_active === "boolean") {
      updates.is_active = body.is_active;
    }
    if (typeof body.custom_fields !== "undefined") {
      Object.assign(updates, extraColumnValues(body.custom_fields, config.fields));
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(config.table_name)
      .update(updates)
      .eq("id", itemId)
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

/** DELETE — permanently remove an item from a custom list's own table. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id, itemId } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to delete from this list.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data: listType, error: listTypeError } = await supabase
      .from("org_custom_list_types")
      .select("*")
      .eq("id", id)
      .single();

    if (listTypeError || !listType) {
      return NextResponse.json({ error: "Unknown list" }, { status: 404 });
    }
    const config = listType as OrgCustomListType;

    const { error } = await supabase.from(config.table_name).delete().eq("id", itemId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
