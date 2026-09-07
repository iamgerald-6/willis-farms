import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import type { OrgCustomListType } from "@/lib/organizationalStructureCustomLists";

/**
 * PATCH — rename a custom list and/or toggle it active/disabled. Renaming
 * only changes `label` (and the `singular` derived from it) — `code` and
 * `table_name` stay put, since the physical table is already named after
 * it. Disabling a list doesn't touch its table or data at all — it just
 * hides it from anywhere it'd be picked for new use (see is_active on
 * OrgCustomListType).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to edit a list.",
      );
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.label !== undefined) {
      const label = (body.label as string | undefined)?.trim();
      if (!label) {
        return NextResponse.json({ error: "List name is required" }, { status: 400 });
      }
      updates.label = label;
      // Same naive singular derivation used at creation time.
      updates.singular = label.replace(/s$/i, "") || label;
    }

    if (typeof body.is_active === "boolean") {
      updates.is_active = body.is_active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
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
      .update(updates)
      .eq("id", id)
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

/**
 * DELETE — remove a custom list type: drops its job_postings foreign key
 * column first (so no column is left pointing at a table about to
 * disappear), then the list's own physical table, then its registry row.
 * Irreversible.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to remove a list.",
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

    for (const column of [
      config.job_posting_column,
      config.job_posting_min_column,
      config.job_posting_max_column,
    ]) {
      if (!column) continue;
      const { error: dropColumnError } = await supabase.rpc("drop_job_posting_org_column", {
        p_column_name: column,
      });
      if (dropColumnError) {
        return NextResponse.json({ error: dropColumnError.message }, { status: 500 });
      }
    }

    const { error: dropError } = await supabase.rpc("drop_org_dynamic_list_table", {
      p_table_name: config.table_name,
    });
    if (dropError) {
      return NextResponse.json({ error: dropError.message }, { status: 500 });
    }

    const { error } = await supabase.from("org_custom_list_types").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
