import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import {
  ORG_STRUCTURE_LISTS,
  isOrgStructureListKey,
  slugifyLabel,
} from "@/lib/organizationalStructure";

/** GET — every row for one list (Sites, Business units, Departments, Sections, Grade levels). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ list: string }> },
) {
  try {
    const { list } = await params;
    if (!isOrgStructureListKey(list)) {
      return NextResponse.json({ error: "Unknown list" }, { status: 404 });
    }

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

    const config = ORG_STRUCTURE_LISTS[list];
    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — add a new row. Only label (and region, for Sites) are ever typed in; code, sort_order, and timestamps are all derived/auto. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ list: string }> },
) {
  try {
    const { list } = await params;
    if (!isOrgStructureListKey(list)) {
      return NextResponse.json({ error: "Unknown list" }, { status: 404 });
    }

    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden(
        "System Definitions add access is required to add to this list.",
      );
    }

    const config = ORG_STRUCTURE_LISTS[list];
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

    const { data: last } = await supabase
      .from(config.table)
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSortOrder = (last?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from(config.table)
      .insert([
        {
          label,
          code: slugifyLabel(label),
          ...(config.hasRegion
            ? { region: (body.region as string | undefined)?.trim() || null }
            : {}),
          sort_order: nextSortOrder,
          is_active: isActive,
          notes,
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
