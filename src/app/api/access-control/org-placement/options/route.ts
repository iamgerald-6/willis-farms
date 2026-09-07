import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireUserManagementAccess, jsonForbidden } from "@/lib/apiRequestAuth";

/**
 * The 6 org-structure lists an employee's placement can be set from — same
 * physical tables job_postings references (see resolveEmployeeOrgPlacement.ts).
 * Keyed by the field name written on users.* so the client can map results
 * straight back onto the right select.
 */
const PLACEMENT_LISTS: { field: string; tableName: string }[] = [
  { field: "site_id", tableName: "sites" },
  { field: "business_unit_id", tableName: "business_units" },
  { field: "department_id", tableName: "departments" },
  { field: "section_id", tableName: "sections" },
  { field: "position_id", tableName: "custom_position" },
  { field: "grade_level_id", tableName: "grade_levels" },
];

export async function GET(req: NextRequest) {
  const caller = await requireUserManagementAccess(req, "view");
  if (!caller) {
    return jsonForbidden("Forbidden — User Management view access required.");
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const { data: listTypes } = await supabaseAdmin
    .from("org_custom_list_types")
    .select("id, label, singular, table_name")
    .in(
      "table_name",
      PLACEMENT_LISTS.map((l) => l.tableName),
    );

  const labelByTable = new Map(
    (listTypes ?? []).map((row) => [
      row.table_name as string,
      (row.singular as string) || (row.label as string),
    ]),
  );

  const lists = await Promise.all(
    PLACEMENT_LISTS.map(async ({ field, tableName }) => {
      const { data: items } = await supabaseAdmin
        .from(tableName)
        .select("id, label")
        .order("sort_order", { ascending: true });
      return {
        field,
        tableName,
        label: labelByTable.get(tableName) ?? field,
        items: (items ?? []).map((i) => ({
          id: i.id as string,
          label: i.label as string,
        })),
      };
    }),
  );

  return NextResponse.json({ data: lists });
}
