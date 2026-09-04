import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { slugifyLabel } from "@/lib/organizationalStructure";
import type { OrgCustomListType } from "@/lib/organizationalStructureCustomLists";

const MAX_RANGE_SIZE = 1000;

/**
 * POST — bulk-fill a numeric-range list (e.g. Age, Salary). Two modes,
 * per the list's numeric_range_mode:
 *  - "digits": one row per whole number from min to max (e.g. Age: 15, 16, 17...).
 *  - "bands": bucketed ranges of `length` from min to max (e.g. Salary:
 *    min 1000, max 20000, length 1000 -> "1000-2000", "2000-3000", ...).
 * Existing rows (matched by code) are skipped rather than erroring, so
 * this is safe to run again to extend a list.
 */
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
    const min = Number(body.min);
    const max = Number(body.max);

    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      return NextResponse.json(
        { error: "Min and max must be whole numbers." },
        { status: 400 },
      );
    }
    if (min > max) {
      return NextResponse.json(
        { error: "Min can't be greater than max." },
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

    const { data: listType, error: listTypeError } = await supabase
      .from("org_custom_list_types")
      .select("*")
      .eq("id", id)
      .single();

    if (listTypeError || !listType) {
      return NextResponse.json({ error: "Unknown list" }, { status: 404 });
    }
    const config = listType as OrgCustomListType;

    if (!config.is_numeric_range) {
      return NextResponse.json(
        { error: "This list isn't set up as a number range." },
        { status: 400 },
      );
    }

    const rows: { label: string; code: string; sort_order: number; is_active: boolean; notes: null }[] = [];

    if (config.numeric_range_mode === "bands") {
      const length = Number(body.length);
      if (!Number.isInteger(length) || length <= 0) {
        return NextResponse.json(
          { error: "Range length must be a positive whole number." },
          { status: 400 },
        );
      }
      if (Math.ceil((max - min) / length) > MAX_RANGE_SIZE) {
        return NextResponse.json(
          { error: `A range can add at most ${MAX_RANGE_SIZE} bands at once.` },
          { status: 400 },
        );
      }

      let start = min;
      while (start < max) {
        const end = Math.min(start + length, max);
        const label = `${start}-${end}`;
        rows.push({
          label,
          code: slugifyLabel(label),
          sort_order: start,
          is_active: true,
          notes: null,
        });
        start = end;
      }
    } else {
      if (max - min + 1 > MAX_RANGE_SIZE) {
        return NextResponse.json(
          { error: `A range can add at most ${MAX_RANGE_SIZE} numbers at once.` },
          { status: 400 },
        );
      }
      for (let n = min; n <= max; n++) {
        rows.push({
          label: String(n),
          code: slugifyLabel(String(n)),
          sort_order: n,
          is_active: true,
          notes: null,
        });
      }
    }

    // Skip entries already in the list rather than failing the whole batch.
    const { data, error } = await supabase
      .from(config.table_name)
      .upsert(rows, { onConflict: "code", ignoreDuplicates: true })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, added: data?.length ?? 0 }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
