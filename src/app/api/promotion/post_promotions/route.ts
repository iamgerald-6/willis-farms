import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { isSupervisor } from "@/lib/accessControl";
import {
  hasBroadElevatedAccessByRoleLabel,
  resolveEffectiveUserRoleLabel,
  resolveUserRoleLabelById,
} from "@/lib/userRoleAccessControl";
import { getApiRequestUser } from "@/lib/apiRequestAuth";
import { assertSiteAccess } from "@/lib/siteAccess";

export async function POST(req: NextRequest) {
  // Real caller identity, verified server-side — previously this route
  // trusted whatever `submitted_by_user_id` the client put in the request
  // body with no check that the caller actually WAS that person (anyone
  // logged in at all could submit a promotion "as" someone else). The
  // authenticated caller's own id is now the only source of truth for who
  // is submitting; the request body no longer supplies it.
  const authedUser = await getApiRequestUser(req);
  if (!authedUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const submitted_by_user_id = authedUser.id;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }
  try {
    const body = await req.json();

    const {
      appraisal_id,
      company_id,
      employee_name,
      current_grade,
      current_job_title,
      proposed_job_title,
      proposed_grade,
      immediate_supervisor,
      reviewing_manager,
      tier_authorisation,
      section_unit,
      triggering_review,
      promotion_step,
      time_in_current_role,
      business_need_confirmed,
      eligibility_checklist,
      assessment_ratings,
      form_data,
      final_decision,
      decision_comments,
      conditions,
      submitted_by_grade,
      user_id,
    } = body;

    if (
      !appraisal_id ||
      !company_id ||
      !employee_name ||
      !current_grade ||
      !final_decision
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: appraisal_id, company_id, employee_name, current_grade, final_decision",
        },
        { status: 400 },
      );
    }

    const { data: submitter } = await supabase
      .from("users")
      .select("company_id")
      .eq("user_id", submitted_by_user_id)
      .maybeSingle();

    if (submitter && submitter.company_id === company_id) {
      return NextResponse.json(
        { error: "You cannot submit a promotion assessment for yourself." },
        { status: 403 },
      );
    }

    // Resolve the promoted employee's real account once, up front — used
    // both for the existing supervisor-authorization check below and to
    // snapshot user_id/supervisor_id/site_id onto the record itself (see
    // docs/multi-site/add-site-id-historical-tables.sql — promotions
    // previously had no real FK to the employee being promoted at all,
    // only a company_id text match, done inline and thrown away).
    //
    // The frontend now resolves and sends the employee's real user_id
    // directly (a true FK, not a derived text match) — prefer that. The
    // company_id lookup is kept only as a fallback for callers that don't
    // supply user_id (e.g. an employee with no platform account yet, or
    // an older client). A promotion for an employee with no platform
    // account at all (employeeRow null either way) still succeeds — those
    // three fields just stay null, same as before.
    const { data: employeeRow } = user_id
      ? await supabase
          .from("users")
          .select("user_id, supervisor_id, site_id")
          .eq("user_id", user_id)
          .maybeSingle()
      : await supabase
          .from("users")
          .select("user_id, supervisor_id, site_id")
          .eq("company_id", company_id)
          .maybeSingle();

    // Site rule applies independently of role — a SITE-scoped caller
    // (i.e. not at headquarters) can only submit a promotion for someone
    // at their own site, even if their role would otherwise let them
    // submit for anyone (see src/lib/siteAccess.ts). An employee with no
    // resolvable account (employeeRow null) has no site to check — that
    // case is left to the existing "no platform account" allowance below,
    // not blocked here.
    if (employeeRow && !assertSiteAccess(authedUser, employeeRow.site_id)) {
      return NextResponse.json(
        { error: "Forbidden — this employee isn't at a site you have access to." },
        { status: 403 },
      );
    }

    // Role opens the ability to submit. Supervisory Role can only submit
    // for people assigned to them (users.supervisor_id). Executive / HR /
    // Super Admin can submit for anyone except themselves.
    const { data: submitterRow } = await supabase
      .from("users")
      .select("user_role_id")
      .eq("user_id", submitted_by_user_id ?? "")
      .maybeSingle();
    const submitterRoleLabel = resolveEffectiveUserRoleLabel(
      await resolveUserRoleLabelById(supabase, submitterRow?.user_role_id),
    );

    if (!isSupervisor(submitterRoleLabel)) {
      return NextResponse.json(
        {
          error:
            "Only Supervisory Role, Executive Role, Human Resource, or Super Admin can submit promotion assessments.",
        },
        { status: 403 },
      );
    }

    if (
      submitted_by_user_id &&
      !hasBroadElevatedAccessByRoleLabel(submitterRoleLabel)
    ) {
      if (employeeRow?.supervisor_id !== submitted_by_user_id) {
        return NextResponse.json(
          {
            error:
              "You can only submit a promotion assessment for employees assigned to you as their supervisor.",
          },
          { status: 403 },
        );
      }
    }

    const insertPayload: Record<string, unknown> = {
      appraisal_id,
      employee_company_id: company_id,
      user_id: employeeRow?.user_id ?? null,
      supervisor_id: employeeRow?.supervisor_id ?? null,
      site_id: employeeRow?.site_id ?? null,
      employee_name,
      current_grade,
      current_job_title: current_job_title ?? null,
      proposed_job_title: proposed_job_title ?? null,
      proposed_grade: proposed_grade ?? null,
      immediate_supervisor: immediate_supervisor ?? null,
      reviewing_manager: reviewing_manager ?? null,
      tier_authorisation: tier_authorisation ?? null,
      section_unit: section_unit ?? null,
      triggering_review: triggering_review ?? null,
      eligibility_checklist: eligibility_checklist ?? {},
      assessment_ratings: assessment_ratings ?? {},
      final_decision,
      decision_comments: decision_comments ?? null,
      conditions: conditions ?? null,
      submitted_by_user_id: submitted_by_user_id ?? null,
      submitted_by_grade: submitted_by_grade ?? null,
    };

    if (promotion_step != null) insertPayload.promotion_step = promotion_step;
    if (time_in_current_role != null)
      insertPayload.time_in_current_role = time_in_current_role;
    if (business_need_confirmed != null)
      insertPayload.business_need_confirmed = business_need_confirmed;
    if (form_data != null) insertPayload.form_data = form_data;

    const { data, error } = await supabase
      .from("promotions")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: unknown) {
    console.error("[POST /api/promotion/post_promotions]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
