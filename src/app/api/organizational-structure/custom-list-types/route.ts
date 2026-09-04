import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { slugifyLabel } from "@/lib/organizationalStructure";
import type {
  CustomFieldDef,
  CustomFieldType,
  OrgCustomListType,
} from "@/lib/organizationalStructureCustomLists";

const VALID_FIELD_TYPES: CustomFieldType[] = ["text", "number", "boolean", "date", "select"];

function sanitizeFields(input: unknown): CustomFieldDef[] | null {
  if (!Array.isArray(input)) return [];
  const fields: CustomFieldDef[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const label = (raw as { label?: unknown }).label;
    const type = (raw as { type?: unknown }).type;
    if (typeof label !== "string" || !label.trim()) return null;
    if (typeof type !== "string" || !VALID_FIELD_TYPES.includes(type as CustomFieldType)) {
      return null;
    }
    const field: CustomFieldDef = {
      key: slugifyLabel(label),
      label: label.trim(),
      type: type as CustomFieldType,
    };
    if (type === "select") {
      const options = (raw as { options?: unknown }).options;
      field.options = Array.isArray(options)
        ? options.filter((o): o is string => typeof o === "string" && !!o.trim()).map((o) => o.trim())
        : [];
    }
    fields.push(field);
  }
  return fields;
}

/** GET — every custom list type, for the Set up hub table. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden(
        "System Definitions view access is required to view custom lists.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data, error } = await supabase
      .from("org_custom_list_types")
      .select("*, org_custom_list_items(count)")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type WithCount = OrgCustomListType & {
      org_custom_list_items?: { count: number }[];
    };
    const withCounts: OrgCustomListType[] = ((data ?? []) as WithCount[]).map((row) => {
      const { org_custom_list_items, ...rest } = row;
      return { ...rest, item_count: org_custom_list_items?.[0]?.count ?? 0 };
    });

    return NextResponse.json({ data: withCounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — create a new custom list type. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden(
        "System Definitions add access is required to add a new list.",
      );
    }

    const body = await req.json();
    const label = (body.label as string | undefined)?.trim();
    const hasRegion = body.has_region === true;

    if (!label) {
      return NextResponse.json({ error: "List name is required" }, { status: 400 });
    }

    const fields = sanitizeFields(body.fields);
    if (fields === null) {
      return NextResponse.json({ error: "Invalid field definitions" }, { status: 400 });
    }

    const fieldKeys = new Set<string>();
    for (const f of fields) {
      if (fieldKeys.has(f.key)) {
        return NextResponse.json(
          { error: `Duplicate field: "${f.label}"` },
          { status: 400 },
        );
      }
      fieldKeys.add(f.key);
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { count } = await supabase
      .from("org_custom_list_types")
      .select("id", { count: "exact", head: true });

    // Naive singular: strip a trailing "s". Good enough for the "Add ___"
    // button text; admins can't rename it after creation (same as `code`
    // on the fixed lists).
    const singular = label.trim().replace(/s$/i, "") || label.trim();

    const { data, error } = await supabase
      .from("org_custom_list_types")
      .insert([
        {
          label: label.trim(),
          singular,
          code: slugifyLabel(label),
          has_region: hasRegion,
          fields,
          sort_order: count ?? 0,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A list with that name already exists." },
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
