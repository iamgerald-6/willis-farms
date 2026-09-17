import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireAuth,
  canAccessAppraisalRecord,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import { fetchEmployeeSupervisorId } from "@/lib/appraisalAccess";
import { fetchGroupPresetsFromDb } from "@/lib/groupPermissionPresets";
import { assertSiteAccess } from "@/lib/siteAccess";
import {
  type AppraisalPip,
  type PipFormResponses,
  fetchEmployeeOrgPlacement,
  isPipEditableStatus,
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
  findGapChainSections,
  refreshGapChainInResponses,
} from "@/lib/appraisal/pipGapChain";
import type { PipFormSchema } from "@/lib/appraisal/pipFormSchema";

/** POST — rebuild performance gaps from the linked appraisal (HR / management only). */
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

  if (!hasFullAppraisalAccess(caller.role)) {
    return jsonForbidden("Only HR or management can refresh PIP gaps from the appraisal.");
  }

  const { presets } = await fetchGroupPresetsFromDb(supabaseAdmin);

  const { data: appraisal, error: appraisalError } = await supabaseAdmin
    .from("appraisals")
    .select("*")
    .eq("id", appraisalId)
    .maybeSingle();

  if (appraisalError || !appraisal) {
    return NextResponse.json({ error: "Appraisal not found" }, { status: 404 });
  }

  const employeeSupervisorId = await fetchEmployeeSupervisorId(
    supabaseAdmin,
    appraisal.employee_user_id,
  );

  if (!canAccessAppraisalRecord(caller, appraisal, employeeSupervisorId, presets)) {
    return jsonForbidden("You do not have access to this appraisal.");
  }
  if (!assertSiteAccess(caller, appraisal.site_id ?? null)) {
    return jsonForbidden("Forbidden — this appraisal isn't at a site you have access to.");
  }

  const { data: pip, error: pipError } = await supabaseAdmin
    .from("appraisal_pips")
    .select("*")
    .eq("appraisal_id", appraisalId)
    .maybeSingle();

  if (pipError || !pip) {
    return NextResponse.json({ error: "PIP not found for this appraisal." }, { status: 404 });
  }

  if (!isPipEditableStatus(pip.status)) {
    return jsonForbidden("This PIP has been submitted and performance gaps can no longer be refreshed.");
  }

  const schema = pip.form_schema as PipFormSchema;
  const gapChain = findGapChainSections(schema);
  if (!gapChain.gaps) {
    return NextResponse.json(
      { error: "This PIP form has no Performance Gaps section to refresh." },
      { status: 400 },
    );
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

  const gradeTemplate = await findGradeTemplateForPlacement(supabaseAdmin, placement);
  const quarter = String(appraisal.review_quarter ?? "Q1") as Quarter;
  const templateSections = resolveTemplateSections(
    gradeTemplate,
    sectionSetForQuarter(quarter),
  );

  const existingResponses = (pip.form_responses ?? { fields: {}, tables: {} }) as PipFormResponses;
  const refreshed = refreshGapChainInResponses(
    existingResponses,
    schema,
    appraisal,
    templateSections,
    appraisalId,
  );

  const tables = { ...refreshed.tables };
  for (const section of schema.sections) {
    if (section.kind === "table" && tables[section.key]) {
      tables[section.key] = applyTableRowAutoIncrement(section, tables[section.key]!);
    }
  }

  const form_responses: PipFormResponses = {
    fields: refreshed.fields,
    tables,
  };

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("appraisal_pips")
    .update({
      form_responses,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pip.id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      pip: updated as AppraisalPip,
      gapCount: refreshed.gapCount,
      appraisalSummary: buildAppraisalSummary(appraisal),
    },
  });
}
