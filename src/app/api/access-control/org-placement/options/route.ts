import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireUserManagementAccess, jsonForbidden } from "@/lib/apiRequestAuth";

/**
 * The 6 fixed org-structure lists an employee's placement can be set from —
 * same physical tables job_postings references (see
 * resolveEmployeeOrgPlacement.ts). Keyed by the field name written on
 * users.* so the client can map results straight back onto the right select.
 */
const BASE_PLACEMENT_LISTS: { field: string; tableName: string }[] = [
  { field: "site_id", tableName: "sites" },
  { field: "business_unit_id", tableName: "business_units" },
  { field: "department_id", tableName: "departments" },
  { field: "section_id", tableName: "sections" },
  { field: "position_id", tableName: "custom_position" },
  { field: "grade_level_id", tableName: "grade_levels" },
];

/**
 * Custom org-structure lists (created via System Definitions >
 * Organizational structure > Add new list) that also belong on an
 * employee's Org placement, alongside the 6 base lists above. Each list's
 * physical table name depends on how/when it was created, so it's resolved
 * by label below rather than hardcoded — and simply left out if the list
 * (or the matching users.* column, see docs/access-control/users-org-
 * placement-user-role.sql) doesn't exist yet.
 */
const CUSTOM_PLACEMENT_LIST_LABELS: { field: string; label: string }[] = [
  { field: "user_role_id", label: "user role" },
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

  const { data: allListTypes } = await supabaseAdmin
    .from("org_custom_list_types")
    .select("id, label, singular, table_name");

  const placementLists = [...BASE_PLACEMENT_LISTS];
  for (const custom of CUSTOM_PLACEMENT_LIST_LABELS) {
    const match = (allListTypes ?? []).find((row) => {
      const name = ((row.singular as string) || (row.label as string) || "")
        .trim()
        .toLowerCase();
      return name === custom.label;
    });
    if (match) {
      placementLists.push({ field: custom.field, tableName: match.table_name as string });
    }
  }

  const labelByTable = new Map(
    (allListTypes ?? [])
      .filter((row) => placementLists.some((l) => l.tableName === row.table_name))
      .map((row) => [
        row.table_name as string,
        (row.singular as string) || (row.label as string),
      ]),
  );

  const lists = await Promise.all(
    placementLists.map(async ({ field, tableName }) => {
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
