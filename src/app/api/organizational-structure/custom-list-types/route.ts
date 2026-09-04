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

// Columns every custom list's table already has — an extra field can't
// reuse one of these names.
const RESERVED_FIELD_KEYS = new Set([
  "id",
  "label",
  "code",
  "region",
  "sort_order",
  "is_active",
  "notes",
  "created_at",
  "updated_at",
]);

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

/** GET — every custom list type, with a live item count per list for the Set up hub table. */
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
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const listTypes = (data ?? []) as OrgCustomListType[];
    const withCounts: OrgCustomListType[] = await Promise.all(
      listTypes.map(async (listType) => {
        const { count } = await supabase
          .from(listType.table_name)
          .select("id", { count: "exact", head: true });
        return { ...listType, item_count: count ?? 0 };
      }),
    );

    return NextResponse.json({ data: withCounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — create a new custom list type, and its own physical table. */
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
    const isNumericRange = body.is_numeric_range === true;
    const numericRangeMode = body.numeric_range_mode === "bands" ? "bands" : "digits";

    if (!label) {
      return NextResponse.json({ error: "List name is required" }, { status: 400 });
    }

    const fields = sanitizeFields(body.fields);
    if (fields === null) {
      return NextResponse.json({ error: "Invalid field definitions" }, { status: 400 });
    }

    const fieldKeys = new Set<string>();
    for (const f of fields) {
      if (RESERVED_FIELD_KEYS.has(f.key)) {
        return NextResponse.json(
          { error: `"${f.label}" isn't available as a field name. Choose another.` },
          { status: 400 },
        );
      }
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
    const code = slugifyLabel(label);
    const tableName = `custom_${code}`;

    // Create the physical table first — if this fails (e.g. name
    // collision), nothing is written to org_custom_list_types at all.
    const { error: createTableError } = await supabase.rpc("create_org_dynamic_list_table", {
      p_table_name: tableName,
      p_has_region: hasRegion,
      p_fields: fields,
    });

    if (createTableError) {
      return NextResponse.json({ error: createTableError.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("org_custom_list_types")
      .insert([
        {
          label: label.trim(),
          singular,
          code,
          table_name: tableName,
          has_region: hasRegion,
          is_numeric_range: isNumericRange,
          numeric_range_mode: numericRangeMode,
          fields,
          sort_order: count ?? 0,
        },
      ])
      .select()
      .single();

    if (error) {
      // Metadata insert failed after the table was already created —
      // clean up so we don't leave an orphaned table with no registry entry.
      await supabase.rpc("drop_org_dynamic_list_table", { p_table_name: tableName });
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
