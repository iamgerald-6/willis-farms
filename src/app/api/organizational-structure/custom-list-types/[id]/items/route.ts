import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { slugifyLabel } from "@/lib/organizationalStructure";
import type {
  CustomFieldDef,
  OrgCustomListItem,
  OrgCustomListType,
} from "@/lib/organizationalStructureCustomLists";

/** Build the extra-column values to insert/update, one per defined field. */
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

/** GET — every item in a custom list's own table. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden(
        "System Definitions view access is required to view this list.",
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

    const { data, error } = await supabase
      .from(config.table_name)
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: (data ?? []) as OrgCustomListItem[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — add a new item to a custom list's own table. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden(
        "System Definitions add access is required to add to this list.",
      );
    }

    const body = await req.json();
    const label = (body.label as string | undefined)?.trim();
    const notes = (body.notes as string | undefined)?.trim() || null;
    const isActive = body.is_active !== false;

    if (!label) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
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

    const { data: last } = await supabase
      .from(config.table_name)
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSortOrder = (last?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from(config.table_name)
      .insert([
        {
          label,
          code: slugifyLabel(label),
          ...(config.has_region
            ? { region: (body.region as string | undefined)?.trim() || null }
            : {}),
          sort_order: nextSortOrder,
          is_active: isActive,
          notes,
          ...extraColumnValues(body.custom_fields, config.fields),
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error:
              "That label produces a code that already exists in this list. Use a different label.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
