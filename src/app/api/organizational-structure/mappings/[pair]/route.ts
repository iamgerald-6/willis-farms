import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { ORG_STRUCTURE_LISTS } from "@/lib/organizationalStructure";
import {
  isOrgMappingPairKey,
  orgStructureTableFor,
  ORG_MAPPING_PAIRS,
  type OrgMappingRow,
} from "@/lib/organizationalStructureMappings";

/**
 * Generic mapping API — covers every Organizational Structure junction
 * table (Site<->Business unit, Business unit<->Department, Department<->
 * Section). `pair` selects which one via ORG_MAPPING_PAIRS.
 */

/** GET — every mapping row for this pair, with labels attached for display. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pair: string }> },
) {
  try {
    const { pair } = await params;
    if (!isOrgMappingPairKey(pair)) {
      return NextResponse.json({ error: "Unknown mapping pair" }, { status: 404 });
    }

    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden(
        "System Definitions view access is required to view mappings.",
      );
    }

    const config = ORG_MAPPING_PAIRS[pair];
    const parentTable = orgStructureTableFor(config.parentListKey);
    const childTable = orgStructureTableFor(config.childListKey);

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    // Built dynamically per pair, so Supabase's literal-string select parser
    // can't type it — cast to `string` to opt out of that check.
    const selectClause = `id, ${config.parentColumn}, ${config.childColumn}, created_at, ${parentTable}(label), ${childTable}(label)` as string;

    const { data, error } = await supabase
      .from(config.table)
      .select(selectClause)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type LabelRef = { label: string } | { label: string }[] | null;
    type Joined = Record<string, unknown> & {
      id: string;
      created_at: string;
    };

    const flat: OrgMappingRow[] = ((data ?? []) as unknown as Joined[]).map((row) => {
      const parentRef = row[parentTable] as LabelRef;
      const childRef = row[childTable] as LabelRef;
      const parent = Array.isArray(parentRef) ? parentRef[0] : parentRef;
      const child = Array.isArray(childRef) ? childRef[0] : childRef;
      return {
        id: row.id,
        parent_id: String(row[config.parentColumn]),
        parent_label: parent?.label ?? "Unknown",
        child_id: String(row[config.childColumn]),
        child_label: child?.label ?? "Unknown",
        created_at: row.created_at,
      };
    });

    return NextResponse.json({ data: flat });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — add a new mapping row for this pair. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pair: string }> },
) {
  try {
    const { pair } = await params;
    if (!isOrgMappingPairKey(pair)) {
      return NextResponse.json({ error: "Unknown mapping pair" }, { status: 404 });
    }

    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden(
        "System Definitions add access is required to add a mapping.",
      );
    }

    const config = ORG_MAPPING_PAIRS[pair];
    const body = await req.json();
    const parentId = (body.parent_id as string | undefined)?.trim();
    const childId = (body.child_id as string | undefined)?.trim();

    if (!parentId || !childId) {
      return NextResponse.json(
        { error: "parent_id and child_id are required" },
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

    const { data, error } = await supabase
      .from(config.table)
      .insert([{ [config.parentColumn]: parentId, [config.childColumn]: childId }])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        const parentSingular = ORG_STRUCTURE_LISTS[config.parentListKey].singular;
        const childSingular = ORG_STRUCTURE_LISTS[config.childListKey].singular;
        return NextResponse.json(
          {
            error: `This ${parentSingular} is already mapped to that ${childSingular}.`,
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
