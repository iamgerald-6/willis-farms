import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { ORG_STRUCTURE_LISTS, isOrgStructureListKey } from "@/lib/organizationalStructure";
import type { OrgMappingGroup } from "@/lib/organizationalStructureMappings";

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
      .select("id, parent_list_key, child_list_key, title, sort_order, created_at")
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
    if (!isOrgStructureListKey(parentListKey) || !isOrgStructureListKey(childListKey)) {
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

    const title = `${ORG_STRUCTURE_LISTS[parentListKey].label} & ${ORG_STRUCTURE_LISTS[childListKey].label}`;

    const { data, error } = await supabase
      .from("org_mapping_groups")
      .insert([
        {
          parent_list_key: parentListKey,
          child_list_key: childListKey,
          title,
          sort_order: count ?? 0,
        },
      ])
      .select()
      .single();

    if (error) {
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
