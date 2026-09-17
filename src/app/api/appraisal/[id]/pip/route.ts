import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireAuth,
  canAccessAppraisalRecord,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import { canSuperviseAppraisal } from "@/lib/appraisal/roles";
import { fetchEmployeeSupervisorId } from "@/lib/appraisalAccess";
import { fetchGroupPresetsFromDb } from "@/lib/groupPermissionPresets";
import { assertSiteAccess } from "@/lib/siteAccess";
import { bandLabel } from "@/lib/appraisal/scoring";
import {
  type AppraisalPip,
  type PipFormResponses,
  fetchEmployeeOrgPlacement,
  fetchHumanResourceFacilitators,
  findPipTemplateForPlacement,
  isPipEditableStatus,
  isPipEligible,
  parseQuarterScore,
  resolvePlacementPositionLabel,
} from "@/lib/appraisal/pipInstances";
import {
  findGradeTemplateForPlacement,
  hasCompleteOrgPlacement,
  resolveTemplateSections,
} from "@/lib/appraisal/gradeTemplates";
import { sectionSetForQuarter, type Quarter } from "@/lib/appraisal/sections";
import { applyTableRowAutoIncrement } from "@/lib/appraisal/pipFormControls";
import {
  buildAppraisalSummary,
  buildGapRowsFromAppraisal,
  collectTemplateReviewItems,
  findGapChainSections,
  prepareResponsesWithGapChain,
} from "@/lib/appraisal/pipGapChain";
import type { PipSystemFieldSourceKey } from "@/lib/appraisal/pipFormSchema";
import { isSystemField } from "@/lib/appraisal/pipFormSchema";

async function loadAppraisalContext(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, appraisalId: string) {
  if (!supabaseAdmin) return null;

  const { data: appraisal, error } = await supabaseAdmin
    .from("appraisals")
    .select("*")
    .eq("id", appraisalId)
    .maybeSingle();

  if (error || !appraisal) return null;

  const employeeSupervisorId = await fetchEmployeeSupervisorId(
    supabaseAdmin,
    appraisal.employee_user_id,
  );

  return { appraisal, employeeSupervisorId };
}

function canManagePip(
  caller: NonNullable<Awaited<ReturnType<typeof requireAuth>>>,
  appraisal: Record<string, unknown>,
  employeeSupervisorId: string | null,
  presets: Awaited<ReturnType<typeof fetchGroupPresetsFromDb>>["presets"],
): boolean {
  if (hasFullAppraisalAccess(caller.role)) return true;
  return canSuperviseAppraisal(
    { role: caller.role, gradeLevel: caller.grade_level, userId: caller.id },
    appraisal,
    employeeSupervisorId ? { supervisor_id: employeeSupervisorId } : null,
    caller,
    presets,
  );
}

const EMPLOYEE_PROFILE_SELECT =
  "user_id, company_id, job_position, departments(label), sections(label), sites(label)";

function labelFromJoin(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const label = (value as { label?: string | null }).label;
  return label?.trim() ? label.trim() : null;
}

function buildSystemFieldValues(
  appraisal: Record<string, unknown>,
  employee: Record<string, unknown> | null,
): Record<PipSystemFieldSourceKey, string> {
  const quarter = String(appraisal.review_quarter ?? "");
  const year = String(appraisal.review_year ?? "");
  const score = parseQuarterScore(appraisal.final_quarter_score as number | string | null);
  const scoreText =
    score != null ? `${score.toFixed(1)}% (${bandLabel(score)})` : "—";

  const departmentAndSite = [
    labelFromJoin(employee?.departments),
    labelFromJoin(employee?.sections),
    labelFromJoin(employee?.sites),
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    employee_name: String(appraisal.employee_name ?? "—"),
    employee_id: String(employee?.company_id ?? appraisal.company_id ?? "—"),
    position: String(
      appraisal.job_title || employee?.job_position || "—",
    ),
    department_and_site:
      departmentAndSite || String(employee?.job_position ?? appraisal.job_title ?? "—"),
    supervisor: String(appraisal.immediate_supervisor ?? "—"),
    hr_facilitator: "",
    appraisal_period_rating: `${quarter} ${year} — ${scoreText}`,
  };
}

/** GET — PIP eligibility + existing instance for this appraisal. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: appraisalId } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const caller = await requireAuth(req);
  if (!caller) return jsonUnauthorized();

  const { presets } = await fetchGroupPresetsFromDb(supabaseAdmin);
  const ctx = await loadAppraisalContext(supabaseAdmin, appraisalId);
  if (!ctx) {
    return NextResponse.json({ error: "Appraisal not found" }, { status: 404 });
  }

  const { appraisal, employeeSupervisorId } = ctx;

  if (!canAccessAppraisalRecord(caller, appraisal, employeeSupervisorId, presets)) {
    return jsonForbidden("You do not have access to this appraisal.");
  }
  if (!assertSiteAccess(caller, appraisal.site_id ?? null)) {
    return jsonForbidden("Forbidden — this appraisal isn't at a site you have access to.");
  }

  const eligible = isPipEligible(appraisal);
  const canManage = canManagePip(caller, appraisal, employeeSupervisorId, presets);

  const { data: pip } = await supabaseAdmin
    .from("appraisal_pips")
    .select("*")
    .eq("appraisal_id", appraisalId)
    .maybeSingle();

  let templateConfigured = false;
  let placementComplete = false;
  let placementPositionLabel: string | null = null;
  if (eligible && appraisal.employee_user_id) {
    const placement = await fetchEmployeeOrgPlacement(
      supabaseAdmin,
      String(appraisal.employee_user_id),
    );
    placementComplete = !!placement && hasCompleteOrgPlacement(placement);
    if (placementComplete && placement) {
      placementPositionLabel = await resolvePlacementPositionLabel(
        supabaseAdmin,
        placement.position_id,
      );
      const match = await findPipTemplateForPlacement(supabaseAdmin, placement);
      templateConfigured = !!match;
    }
  }

  const hrFacilitators = await fetchHumanResourceFacilitators(supabaseAdmin);

  let systemFields: Record<string, string> | null = null;
  if (pip) {
    const { data: employee } = await supabaseAdmin
      .from("users")
      .select(EMPLOYEE_PROFILE_SELECT)
      .eq("user_id", String(pip.employee_user_id))
      .maybeSingle();
    systemFields = buildSystemFieldValues(appraisal, employee);
  }

  const appraisalSummary = buildAppraisalSummary(appraisal);

  let competencyTaskOptions: string[] = [];
  if (appraisal.employee_user_id) {
    const placement = await fetchEmployeeOrgPlacement(
      supabaseAdmin,
      String(appraisal.employee_user_id),
    );
    if (placement && hasCompleteOrgPlacement(placement)) {
      const gradeTemplate = await findGradeTemplateForPlacement(supabaseAdmin, placement);
      const quarter = String(appraisal.review_quarter ?? "Q1") as Quarter;
      competencyTaskOptions = collectTemplateReviewItems(
        resolveTemplateSections(gradeTemplate, sectionSetForQuarter(quarter)),
      );
    }
  }

  return NextResponse.json({
    data: {
      eligible,
      canManage,
      canViewHrSections: hasFullAppraisalAccess(caller.role),
      templateConfigured,
      placementComplete,
      pip: (pip as AppraisalPip | null) ?? null,
      systemFields,
      appraisalSummary,
      hrFacilitators,
      placementPositionLabel,
      competencyTaskOptions,
    },
  });
}

/** POST — create a PIP instance for an eligible, final-reviewed appraisal. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: appraisalId } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const caller = await requireAuth(req);
  if (!caller) return jsonUnauthorized();

  const { presets } = await fetchGroupPresetsFromDb(supabaseAdmin);
  const ctx = await loadAppraisalContext(supabaseAdmin, appraisalId);
  if (!ctx) {
    return NextResponse.json({ error: "Appraisal not found" }, { status: 404 });
  }

  const { appraisal, employeeSupervisorId } = ctx;

  if (!canManagePip(caller, appraisal, employeeSupervisorId, presets)) {
    return jsonForbidden("Only the supervisor or HR can start a PIP.");
  }
  if (!assertSiteAccess(caller, appraisal.site_id ?? null)) {
    return jsonForbidden("Forbidden — this appraisal isn't at a site you have access to.");
  }
  if (!isPipEligible(appraisal)) {
    return NextResponse.json(
      { error: "A PIP can only be started after final review when the score is below 70%." },
      { status: 400 },
    );
  }
  if (!appraisal.employee_user_id) {
    return NextResponse.json({ error: "This appraisal is not linked to an employee account." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("appraisal_pips")
    .select("*")
    .eq("appraisal_id", appraisalId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ data: existing as AppraisalPip });
  }

  const placement = await fetchEmployeeOrgPlacement(
    supabaseAdmin,
    String(appraisal.employee_user_id),
  );

  if (!placement || !hasCompleteOrgPlacement(placement)) {
    return NextResponse.json(
      { error: "Could not load the employee's org placement." },
      { status: 404 },
    );
  }

  let { data: employee, error: employeeError } = await supabaseAdmin
    .from("users")
    .select(EMPLOYEE_PROFILE_SELECT)
    .eq("user_id", String(appraisal.employee_user_id))
    .maybeSingle();

  // FK embeds may be missing from PostgREST cache — fall back to core columns.
  if (employeeError || !employee) {
    const fallback = await supabaseAdmin
      .from("users")
      .select("user_id, company_id, job_position")
      .eq("user_id", String(appraisal.employee_user_id))
      .maybeSingle();
    employee = fallback.data;
    employeeError = fallback.error;
  }

  if (employeeError || !employee) {
    return NextResponse.json({ error: "Employee account not found." }, { status: 404 });
  }

  const templateMatch = await findPipTemplateForPlacement(supabaseAdmin, placement);
  if (!templateMatch?.active_version_id || !templateMatch.form_schema) {
    const positionLabel =
      (await resolvePlacementPositionLabel(supabaseAdmin, placement.position_id)) ??
      "this position";
    return NextResponse.json(
      {
        error: `No published PIP form is set up for ${positionLabel} at this employee's site and org placement. Configure one under Manage appraisals → PIP form setup.`,
      },
      { status: 404 },
    );
  }

  const gradeTemplate = await findGradeTemplateForPlacement(supabaseAdmin, placement);
  const quarter = String(appraisal.review_quarter ?? "Q1") as Quarter;
  const templateSections = resolveTemplateSections(
    gradeTemplate,
    sectionSetForQuarter(quarter),
  );

  const gapChain = findGapChainSections(templateMatch.form_schema);

  const initialResponses: PipFormResponses = { fields: {}, tables: {} };
  for (const section of templateMatch.form_schema.sections) {
    if (section.kind === "fields") {
      for (const field of section.fields) {
        if (isSystemField(field)) continue;
        if (field.type === "select" && field.options?.length) {
          initialResponses.fields![field.key] = field.options[0];
        } else {
          initialResponses.fields![field.key] = "";
        }
      }
    } else if (gapChain.gaps && section.key === gapChain.gaps.key) {
      initialResponses.tables![section.key] = applyTableRowAutoIncrement(
        section,
        buildGapRowsFromAppraisal(section, appraisal, templateSections, appraisalId),
      );
    } else {
      const rows = Array.from({ length: section.minRows || 1 }, () =>
        Object.fromEntries(section.columns.map((col) => [col.key, ""])),
      );
      initialResponses.tables![section.key] = applyTableRowAutoIncrement(section, rows);
    }
  }

  const synced = prepareResponsesWithGapChain(initialResponses, templateMatch.form_schema);
  for (const section of templateMatch.form_schema.sections) {
    if (section.kind !== "table" || !synced.tables[section.key]) continue;
    synced.tables[section.key] = applyTableRowAutoIncrement(section, synced.tables[section.key]!);
  }
  Object.assign(initialResponses, synced);

  const systemFields = buildSystemFieldValues(appraisal, employee);
  for (const section of templateMatch.form_schema.sections) {
    if (section.kind !== "fields") continue;
    for (const field of section.fields) {
      if (isSystemField(field)) {
        initialResponses.fields![field.key] = systemFields[field.systemSource] ?? "—";
      }
    }
  }

  const { data: pip, error: insertError } = await supabaseAdmin
    .from("appraisal_pips")
    .insert({
      appraisal_id: appraisalId,
      employee_user_id: employee.user_id,
      pip_template_id: templateMatch.id,
      template_version_id: templateMatch.active_version_id,
      form_schema: templateMatch.form_schema,
      form_responses: initialResponses,
      status: "draft",
      created_by: caller.id,
      created_by_name: caller.name ?? null,
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      data: {
        pip: pip as AppraisalPip,
        systemFields,
        appraisalSummary: buildAppraisalSummary(appraisal),
      },
    },
    { status: 201 },
  );
}

/** PATCH — save PIP responses (supervisor / HR). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: appraisalId } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const caller = await requireAuth(req);
  if (!caller) return jsonUnauthorized();

  const { presets } = await fetchGroupPresetsFromDb(supabaseAdmin);
  const ctx = await loadAppraisalContext(supabaseAdmin, appraisalId);
  if (!ctx) {
    return NextResponse.json({ error: "Appraisal not found" }, { status: 404 });
  }

  const { appraisal, employeeSupervisorId } = ctx;

  if (!canManagePip(caller, appraisal, employeeSupervisorId, presets)) {
    return jsonForbidden("Only the supervisor or HR can edit a PIP.");
  }

  const body = (await req.json()) as {
    form_responses?: PipFormResponses;
    status?: AppraisalPip["status"];
  };

  const { data: pip, error: fetchError } = await supabaseAdmin
    .from("appraisal_pips")
    .select("*")
    .eq("appraisal_id", appraisalId)
    .maybeSingle();

  if (fetchError || !pip) {
    return NextResponse.json({ error: "PIP not found for this appraisal." }, { status: 404 });
  }

  const currentStatus = (pip.status as AppraisalPip["status"]) ?? "draft";

  if (!isPipEditableStatus(currentStatus)) {
    if (body.form_responses) {
      return jsonForbidden("This PIP has been submitted and can no longer be edited.");
    }
    if (body.status && body.status !== currentStatus) {
      return jsonForbidden("This PIP has been submitted and its status cannot be changed.");
    }
  }

  if (body.status && body.status !== currentStatus) {
    if (body.status === "active" && currentStatus === "draft") {
      // Submit — allowed together with a final form_responses save.
    } else {
      return jsonForbidden("Invalid PIP status change.");
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.form_responses) updates.form_responses = body.form_responses;
  if (body.status) updates.status = body.status;

  const { data, error } = await supabaseAdmin
    .from("appraisal_pips")
    .update(updates)
    .eq("id", pip.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data as AppraisalPip });
}
