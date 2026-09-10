import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import {
  canViewAllAppraisalPeriods,
  hasFullAppraisalAccess,
} from "@/lib/accessControl";
import { fetchGroupPresetsFromDb } from "@/lib/groupPermissionPresets";
import { getActiveAppraisalPeriod } from "@/lib/appraisal/deadlines";
import { isUntouchedAppraisalSeed } from "@/lib/appraisal/supervisorDisplay";
import { enrichAppraisalsWithSupervisor } from "@/lib/appraisal/enrichAppraisalSupervisor";
import {
  appraisalRowVisibleToSupervisor,
  loadDirectReports,
  resolveAppraisalListScope,
  staffIdsForSupervisorScope,
} from "@/lib/appraisalAccess";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const { presets } = await fetchGroupPresetsFromDb(supabaseAdmin);

    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    const cycle = searchParams.get("cycle");
    const grade_band = searchParams.get("grade_band");
    let review_year = searchParams.get("review_year");
    let review_quarter = searchParams.get("review_quarter");
    const status = searchParams.get("status");
    let archived = searchParams.get("archived");

    const companyWideAccess = hasFullAppraisalAccess(caller.role);
    const listScope = resolveAppraisalListScope(caller, presets);
    const canBrowsePeriods = canViewAllAppraisalPeriods(caller.role);

    if (!canBrowsePeriods) {
      const active = getActiveAppraisalPeriod();
      review_quarter = active.quarter;
      review_year = String(active.year);
      if (archived === "true") {
        return jsonForbidden(
          "Only managers and admins can view archived appraisals.",
        );
      }
      if (archived !== "all") archived = "false";
    }

    if (!companyWideAccess) {
      if (
        company_id &&
        listScope === "own" &&
        caller.company_id &&
        company_id !== caller.company_id
      ) {
        return jsonForbidden("You can only view your own appraisals.");
      }
    }

    let directReports: Awaited<ReturnType<typeof loadDirectReports>> = [];
    if (listScope === "reports") {
      directReports = await loadDirectReports(supabaseAdmin, caller.id);
    }

    let query = supabaseAdmin
      .from("appraisals")
      .select("*")
      .order("created_at", { ascending: false });

    if (listScope === "own") {
      if (company_id) {
        query = query.eq("company_id", company_id);
      } else if (caller.company_id) {
        query = query.eq("company_id", caller.company_id);
      } else if (caller.id) {
        query = query.eq("employee_user_id", caller.id);
      } else {
        return NextResponse.json({ data: [] });
      }
    } else if (listScope === "reports") {
      const staffIds = staffIdsForSupervisorScope(caller, directReports);
      if (staffIds.length === 0) {
        return NextResponse.json({ data: [] });
      }
      query = query.in("company_id", staffIds);
    }

    if (cycle) query = query.eq("cycle", cycle);
    if (grade_band) query = query.eq("grade_band", grade_band);
    if (review_year) query = query.eq("review_year", Number(review_year));
    if (review_quarter) query = query.eq("review_quarter", review_quarter);
    if (status) query = query.eq("status", status);

    if (archived === "true") {
      query = query.eq("archived", true);
    } else if (archived !== "all") {
      query = query.not("archived", "is", true);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    let rows = data ?? [];

    if (!companyWideAccess) {
      rows = rows.filter((row) => {
        if (!isUntouchedAppraisalSeed(row)) return true;
        const isOwnRow =
          (row.employee_user_id && row.employee_user_id === caller.id) ||
          (caller.company_id &&
            row.company_id === caller.company_id &&
            !row.employee_user_id);
        if (isOwnRow) return false;
        return true;
      });
    }

    rows = await enrichAppraisalsWithSupervisor(supabaseAdmin, rows);

    if (listScope === "reports") {
      rows = rows.filter((row) =>
        appraisalRowVisibleToSupervisor(row, caller, directReports),
      );
    }

    return NextResponse.json({ data: rows });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
