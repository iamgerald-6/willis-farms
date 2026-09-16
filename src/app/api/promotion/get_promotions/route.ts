import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requirePromotionAccess } from "@/lib/apiRequestAuth";
import { siteFilterValue } from "@/lib/siteAccess";

export async function GET(req: NextRequest) {
  const authedUser = await requirePromotionAccess(req);
  if (!authedUser) {
    return NextResponse.json(
      { error: "Forbidden — Promotion view access is required." },
      { status: 403 },
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    // site_id is a direct column on promotions (a creation-time snapshot,
    // not live-inherited — see docs/multi-site/add-site-id-historical-tables.sql)
    // so it can be filtered on directly, no join needed.
    let query = supabaseAdmin
      .from("promotions")
      .select(
        `
        id,
        appraisal_id,
        employee_company_id,
        employee_name,
        current_grade,
        current_job_title,
        proposed_grade,
        proposed_job_title,
        immediate_supervisor,
        reviewing_manager,
        triggering_review,
        tier_authorisation,
        section_unit,
        eligibility_checklist,
        assessment_ratings,
        final_decision,
        decision_comments,
        conditions,
        submitted_by_user_id,
        submitted_by_grade,
        promotion_step,
        time_in_current_role,
        business_need_confirmed,
        form_data,
        created_at,
        updated_at
      `,
      )
      .order("created_at", { ascending: false });

    const siteId = siteFilterValue(authedUser);
    if (siteId != null) {
      query = query.eq("site_id", siteId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const submitterIds = [
      ...new Set(
        (data ?? [])
          .map((p) => p.submitted_by_user_id)
          .filter((id): id is string => !!id),
      ),
    ];

    let submitterNameById: Record<string, string> = {};
    if (submitterIds.length > 0) {
      const { data: submitters } = await supabaseAdmin
        .from("users")
        .select("user_id, first_name, last_name")
        .in("user_id", submitterIds);
      submitterNameById = Object.fromEntries(
        (submitters ?? []).map((u) => [
          u.user_id,
          `${u.first_name} ${u.last_name}`.trim(),
        ]),
      );
    }

    const enriched = (data ?? []).map((p) => ({
      ...p,
      submitted_by_name: p.submitted_by_user_id
        ? submitterNameById[p.submitted_by_user_id] ?? "Unknown"
        : null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (err: any) {
    console.error("[GET /api/promotion/get_promotions]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
