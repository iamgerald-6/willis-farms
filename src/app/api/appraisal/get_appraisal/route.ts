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
import { getActiveAppraisalPeriod } from "@/lib/appraisal/deadlines";
import { isUntouchedAppraisalSeed } from "@/lib/appraisal/supervisorDisplay";
import { enrichAppraisalsWithSupervisor } from "@/lib/appraisal/enrichAppraisalSupervisor";

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

    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    const cycle = searchParams.get("cycle");
    const grade_band = searchParams.get("grade_band");
    let review_year = searchParams.get("review_year");
    let review_quarter = searchParams.get("review_quarter");
    const status = searchParams.get("status");
    let archived = searchParams.get("archived");

    const fullAccess = hasFullAppraisalAccess(caller.role, caller.grade_level);
    const canBrowsePeriods = canViewAllAppraisalPeriods(caller.role);

    // Employees (any grade) are locked to the single active period. Manager /
    // Admin / Super Admin may request other quarters or the archived list.
    if (!canBrowsePeriods) {
      const active = getActiveAppraisalPeriod();
      review_quarter = active.quarter;
      review_year = String(active.year);
      // Employees never browse the archived filing cabinet.
      if (archived === "true") {
        return jsonForbidden(
          "Only managers and admins can view archived appraisals.",
        );
      }
      if (archived !== "all") archived = "false";
    }

    if (!fullAccess) {
      if (company_id && caller.company_id && company_id !== caller.company_id) {
        return jsonForbidden("You can only view your own appraisals.");
      }
    }

    let query = supabaseAdmin
      .from("appraisals")
      .select("*")
      .order("created_at", { ascending: false });

    if (company_id) query = query.eq("company_id", company_id);
    if (cycle) query = query.eq("cycle", cycle);
    if (grade_band) query = query.eq("grade_band", grade_band);
    if (review_year) query = query.eq("review_year", Number(review_year));
    if (review_quarter) query = query.eq("review_quarter", review_quarter);
    if (status) query = query.eq("status", status);

    // Archived records are filed away — excluded unless explicitly requested.
    // "is not true" rather than "= false" so rows predating the column show up.
    if (archived === "true") {
      query = query.eq("archived", true);
    } else if (archived !== "all") {
      query = query.not("archived", "is", true);
    }

    // Without full access you see your own record plus any record you are the
    // named supervisor on — mirrors canAccessAppraisalRecord(). Supervisors
    // below L5 rely on this to complete the evaluations assigned to them.
    if (!fullAccess) {
      const visibleTo = [
        caller.company_id ? `company_id.eq.${caller.company_id}` : null,
        caller.id ? `employee_user_id.eq.${caller.id}` : null,
        caller.id ? `supervisor_id.eq.${caller.id}` : null,
      ].filter(Boolean) as string[];

      if (visibleTo.length === 0) {
        return NextResponse.json({ data: [] });
      }
      query = query.or(visibleTo.join(","));
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    let rows = data ?? [];

    // Hide cron-seeded placeholder rows from the employee themselves until they
    // start. Supervisors still see untouched rows for their direct reports.
    if (!fullAccess) {
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

    return NextResponse.json({ data: rows });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
