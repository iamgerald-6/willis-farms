import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAuth, jsonUnauthorized } from "@/lib/apiRequestAuth";
import {
  appraisalRowVisibleToSupervisor,
  loadDirectReports,
  resolveAppraisalListScope,
} from "@/lib/appraisalAccess";
import { fetchGroupPresetsFromDb } from "@/lib/groupPermissionPresets";
import { siteFilterValue } from "@/lib/siteAccess";
import type { PipListItem } from "@/lib/appraisal/pipInstances";
import { parseQuarterScore } from "@/lib/appraisal/pipInstances";

/** GET — submitted PIPs (active / completed) scoped by role. */
export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const caller = await requireAuth(req);
  if (!caller) return jsonUnauthorized();

  const { presets } = await fetchGroupPresetsFromDb(supabaseAdmin);
  const listScope = resolveAppraisalListScope(caller, presets);

  let directReports: Awaited<ReturnType<typeof loadDirectReports>> = [];
  if (listScope === "reports") {
    directReports = await loadDirectReports(supabaseAdmin, caller.id);
  }

  const { data: rows, error } = await supabaseAdmin
    .from("appraisal_pips")
    .select(
      `
      id,
      appraisal_id,
      employee_user_id,
      status,
      created_at,
      updated_at,
      created_by_name,
      appraisals (
        employee_name,
        job_title,
        review_quarter,
        review_year,
        final_quarter_score,
        company_id,
        employee_user_id,
        supervisor_id,
        site_id
      )
    `,
    )
    .in("status", ["active", "completed"])
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const siteId = listScope !== "own" ? siteFilterValue(caller) : null;

  const items: PipListItem[] = [];

  for (const row of rows ?? []) {
    const appraisal = row.appraisals as {
      employee_name?: string | null;
      job_title?: string | null;
      review_quarter?: string | null;
      review_year?: number | null;
      final_quarter_score?: number | string | null;
      company_id?: string | null;
      employee_user_id?: string | null;
      supervisor_id?: string | null;
      site_id?: string | null;
    } | null;

    if (!appraisal) continue;

    const merged = {
      company_id: appraisal.company_id,
      employee_user_id: row.employee_user_id ?? appraisal.employee_user_id,
      supervisor_id: appraisal.supervisor_id,
    };

    if (listScope === "own") {
      const isOwnUser =
        caller.id && merged.employee_user_id === caller.id;
      const isOwnCompany =
        caller.company_id &&
        appraisal.company_id &&
        appraisal.company_id === caller.company_id;
      if (!isOwnUser && !isOwnCompany) continue;
    } else if (listScope === "reports") {
      if (
        !appraisalRowVisibleToSupervisor(merged, caller, directReports)
      ) {
        continue;
      }
    } else if (siteId != null && appraisal.site_id !== siteId) {
      continue;
    }

    items.push({
      id: String(row.id),
      appraisal_id: String(row.appraisal_id),
      employee_user_id: String(row.employee_user_id),
      status: row.status as PipListItem["status"],
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      created_by_name: row.created_by_name ?? null,
      employee_name: String(appraisal.employee_name ?? "—"),
      job_title: String(appraisal.job_title ?? "—"),
      review_quarter: String(appraisal.review_quarter ?? ""),
      review_year: Number(appraisal.review_year ?? 0),
      final_quarter_score: parseQuarterScore(appraisal.final_quarter_score),
      company_id: appraisal.company_id ?? null,
    });
  }

  return NextResponse.json({
    data: {
      items,
      scope: listScope,
    },
  });
}
