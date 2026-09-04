import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { ORG_STRUCTURE_LISTS } from "@/lib/organizationalStructure";
import {
  parseListRef,
  type OrgListRef,
  type OrgMappingGroup,
} from "@/lib/organizationalStructureMappings";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Display label for a list ref — looked up from the fixed config or the
 * org_custom_list_types table, depending on which kind it is. */
async function labelForRef(
  supabase: SupabaseClient,
  ref: OrgListRef,
): Promise<string | null> {
  if (ref.kind === "fixed") {
    return ORG_STRUCTURE_LISTS[ref.key].label;
  }
  const { data } = await supabase
    .from("org_custom_list_types")
    .select("label")
    .eq("id", ref.id)
    .maybeSingle();
  return data?.label ?? null;
}

/** GET — every mapping group (one per Mapping set up accordion panel). */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden(
        "System Definitions view access is required to view mapping groups.",
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
      .from("org_mapping_groups")
      .select("id, parent_list_key, child_list_key, title, table_name, sort_order, created_at")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: (data ?? []) as OrgMappingGroup[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — create a new mapping group between two org structure lists. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden(
        "System Definitions add access is required to add a mapping group.",
      );
    }

    const body = await req.json();
    const parentListKey = (body.parent_list_key as string | undefined)?.trim();
    const childListKey = (body.child_list_key as string | undefined)?.trim();

    if (!parentListKey || !childListKey) {
      return NextResponse.json(
        { error: "parent_list_key and child_list_key are required" },
        { status: 400 },
      );
    }
    const parentRef = parseListRef(parentListKey);
    const childRef = parseListRef(childListKey);
    if (!parentRef || !childRef) {
      return NextResponse.json({ error: "Unknown list key" }, { status: 400 });
    }
    if (parentListKey === childListKey) {
      return NextResponse.json(
        { error: "Choose two different lists to map." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const parentLabel = await labelForRef(supabase, parentRef);
    const childLabel = await labelForRef(supabase, childRef);
    if (!parentLabel || !childLabel) {
      return NextResponse.json({ error: "Unknown list key" }, { status: 400 });
    }

    // Block the pair in either order — Site<->Business unit and Business
    // unit<->Site would otherwise both be creatable as "different" groups.
    const { data: existing, error: existingError } = await supabase
      .from("org_mapping_groups")
      .select("id")
      .or(
        `and(parent_list_key.eq.${parentListKey},child_list_key.eq.${childListKey}),and(parent_list_key.eq.${childListKey},child_list_key.eq.${parentListKey})`,
      )
      .limit(1);

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "A mapping group for this pair already exists." },
        { status: 409 },
      );
    }

    const { count } = await supabase
      .from("org_mapping_groups")
      .select("id", { count: "exact", head: true });

    const title = `${parentLabel} & ${childLabel}`;

    // Generate the id ourselves so the table name (derived from it) is
    // known before the row is inserted — a UUID contains only hex digits
    // and dashes, so this is always a valid, unique Postgres identifier.
    const groupId = randomUUID();
    const tableName = `mapping_${groupId.replace(/-/g, "_")}`;

    // Create the physical table first — if this fails, nothing is written
    // to org_mapping_groups at all.
    const { error: createTableError } = await supabase.rpc("create_org_dynamic_mapping_table", {
      p_table_name: tableName,
    });
    if (createTableError) {
      return NextResponse.json({ error: createTableError.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("org_mapping_groups")
      .insert([
        {
          id: groupId,
          parent_list_key: parentListKey,
          child_list_key: childListKey,
          title,
          table_name: tableName,
          sort_order: count ?? 0,
        },
      ])
      .select()
      .single();

    if (error) {
      // Metadata insert failed after the table was already created — clean
      // up so we don't leave an orphaned table with no registry entry.
      await supabase.rpc("drop_org_dynamic_mapping_table", { p_table_name: tableName });
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A mapping group for this pair already exists." },
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
