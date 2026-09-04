import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { ORG_STRUCTURE_LISTS, slugifyLabel } from "@/lib/organizationalStructure";
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

/** Singular form for a list ref — used to derive the mapping table's real
 * column names (e.g. "section" -> "section_id"). */
async function singularForRef(
  supabase: SupabaseClient,
  ref: OrgListRef,
): Promise<string | null> {
  if (ref.kind === "fixed") {
    return ORG_STRUCTURE_LISTS[ref.key].singular;
  }
  const { data } = await supabase
    .from("org_custom_list_types")
    .select("singular")
    .eq("id", ref.id)
    .maybeSingle();
  return data?.singular ?? null;
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
      .select(
        "id, parent_list_key, child_list_key, title, table_name, parent_column, child_column, sort_order, created_at",
      )
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

    // Human-readable table name from the two list names, e.g.
    // "mapping_sections_positions" — not the group's id. Postgres
    // identifiers cap at 63 bytes, so each half is trimmed to leave room
    // for the "mapping_" prefix and a numeric suffix if there's a
    // collision (two pairs slugifying to the same name).
    const baseTableName =
      `mapping_${slugifyLabel(parentLabel)}_${slugifyLabel(childLabel)}`.slice(0, 55);
    let tableName = baseTableName;
    let suffix = 2;
    for (;;) {
      const { data: collision } = await supabase
        .from("org_mapping_groups")
        .select("id")
        .eq("table_name", tableName)
        .maybeSingle();
      if (!collision) break;
      tableName = `${baseTableName}_${suffix}`;
      suffix += 1;
    }

    // Real column names, e.g. "section_id" / "position_id" — same
    // convention as the original fixed pairs (site_id, business_unit_id).
    const parentSingular = (await singularForRef(supabase, parentRef)) ?? "parent";
    const childSingularRaw = (await singularForRef(supabase, childRef)) ?? "child";
    const parentColumn = `${slugifyLabel(parentSingular)}_id`;
    let childColumn = `${slugifyLabel(childSingularRaw)}_id`;
    if (parentColumn === childColumn) {
      childColumn = `${childColumn}_2`;
    }

    // Create the physical table first — if this fails, nothing is written
    // to org_mapping_groups at all.
    const { error: createTableError } = await supabase.rpc("create_org_dynamic_mapping_table", {
      p_table_name: tableName,
      p_parent_column: parentColumn,
      p_child_column: childColumn,
    });
    if (createTableError) {
      return NextResponse.json({ error: createTableError.message }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("org_mapping_groups")
      .insert([
        {
          parent_list_key: parentListKey,
          child_list_key: childListKey,
          title,
          table_name: tableName,
          parent_column: parentColumn,
          child_column: childColumn,
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
