import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireUserManagementAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import {
  EMPTY_ORG_MAP_ROWS,
  ORG_MAP_TABLES,
  type OrgMapKey,
  type OrgMapRows,
} from "@/lib/organizationalStructureMapping";

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
    .select("id, label, singular, table_name, job_posting_column");

  const placementLists = [...BASE_PLACEMENT_LISTS];
  const userRoleList = (allListTypes ?? []).find((row) => {
    const name = ((row.singular as string) || (row.label as string) || "")
      .trim()
      .toLowerCase();
    const column = (
      (row as { job_posting_column?: string | null }).job_posting_column ?? ""
    )
      .trim()
      .toLowerCase();
    return (
      name === "user role" ||
      name === "supervisory role" ||
      column === "supervisory_role_id" ||
      column === "user_role_id"
    );
  });
  if (userRoleList) {
    placementLists.push({
      field: "user_role_id",
      tableName: userRoleList.table_name as string,
    });
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

  const maps: OrgMapRows = { ...EMPTY_ORG_MAP_ROWS };
  for (const key of Object.keys(ORG_MAP_TABLES) as OrgMapKey[]) {
    const { data: rows } = await supabaseAdmin.from(ORG_MAP_TABLES[key]).select("*");
    maps[key] = (rows ?? []) as OrgMapRows[OrgMapKey];
  }

  return NextResponse.json({ data: lists, maps });
}
