import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  jsonUnauthorized,
  requireAuth,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import {
  diffFields,
  fetchModuleConfig,
  normalizeFormDefinition,
  parseModuleBusinessLogic,
  writeSystemConfigAuditLog,
} from "@/lib/systemDefinitions";
import { getModuleByIdSync } from "@/lib/moduleRegistry";

const BUSINESS_LOGIC_KEYS = [
  "sectionWeightRules",
  "sectionBaseWeights",
  "globalSectionWeights",
  "sectionContentOverrides",
  "competencyContentOverrides",
  "refereeReferenceConfig",
  "applicationFormConfig",
  "gradeLevelsConfig",
  "appraisalScopeConfig",
  "annualLeaveCapDays",
  "companyEmailDomain",
  "interviewGuidesConfig",
  "interviewEvaluationConfig",
];

function pickDefinedBusinessLogic(
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(incoming).filter(([, value]) => value !== undefined),
  );
}

function decodeModuleId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> },
) {
  try {
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const moduleId = decodeModuleId((await params).moduleId);
    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const config = await fetchModuleConfig(supabase, moduleId);
    return NextResponse.json({
      data: {
        module_id: moduleId,
        businessLogic: config.businessLogic,
        formDefinition: config.formDefinition,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> },
) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, ["add", "edit"]);
    if (!caller) {
      return jsonForbidden(
        "System Definitions add or edit access is required to save module settings.",
      );
    }

    const moduleId = decodeModuleId((await params).moduleId);
    const body = await req.json();

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const current = await fetchModuleConfig(supabase, moduleId);

    const incomingBl = body.business_logic ?? body.businessLogic;
    const businessLogic = incomingBl
      ? {
          ...current.businessLogic,
          ...pickDefinedBusinessLogic(incomingBl as Record<string, unknown>),
        }
      : current.businessLogic;

    const incomingForm = body.form_definition ?? body.formDefinition;
    const formDefinition =
      incomingForm !== undefined
        ? normalizeFormDefinition(incomingForm)
        : normalizeFormDefinition(
            (
              await supabase
                .from("system_modules")
                .select("form_definition")
                .eq("module_id", moduleId)
                .maybeSingle()
            ).data?.form_definition,
          );

    const patch: Record<string, unknown> = {
      business_logic: businessLogic,
    };
    if (incomingForm !== undefined) {
      patch.form_definition = formDefinition;
    }

    // Diff against the effective (Git + DB merged) config that was in
    // force a moment ago — this is what actually governed behaviour, so
    // it's what the audit trail should say "it used to be".
    const blDiff = diffFields(
      current.businessLogic as unknown as Record<string, unknown>,
      businessLogic as unknown as Record<string, unknown>,
      BUSINESS_LOGIC_KEYS,
    );
    const changedFields = [...blDiff.changedFields];
    const previousValues = { ...blDiff.previousValues };
    const newValues = { ...blDiff.newValues };
    if (
      incomingForm !== undefined &&
      JSON.stringify(current.formDefinition ?? null) !==
        JSON.stringify(formDefinition ?? null)
    ) {
      changedFields.push("form_definition");
      previousValues.form_definition = current.formDefinition ?? null;
      newValues.form_definition = formDefinition ?? null;
    }

    const moduleLabel = getModuleByIdSync(moduleId)?.label ?? moduleId;

    const { data: existing } = await supabase
      .from("system_modules")
      .select("module_id")
      .eq("module_id", moduleId)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("system_modules")
        .update(patch)
        .eq("module_id", moduleId)
        .select("module_id, business_logic, form_definition")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (changedFields.length > 0) {
        await writeSystemConfigAuditLog(supabase, {
          module_id: moduleId,
          config_scope: "business_logic",
          entity_label: moduleLabel,
          action: "updated",
          changed_fields: changedFields,
          previous_values: previousValues,
          new_values: newValues,
          performed_by: caller.id,
          performed_by_name: caller.name,
        });
      }

      return NextResponse.json({
        data: {
          ...data,
          businessLogic: parseModuleBusinessLogic(data?.business_logic),
        },
      });
    }

    const { data, error } = await supabase
      .from("system_modules")
      .insert([
        {
          module_id: moduleId,
          source: "override",
          enabled: true,
          ...patch,
        },
      ])
      .select("module_id, business_logic, form_definition")
      .maybeSingle();

    if (error) {
      if (
        error.code === "42P01" ||
        error.message?.includes("does not exist")
      ) {
        return NextResponse.json(
          {
            error:
              "The system_modules table is not set up yet. Run docs/system-definitions/schema.sql in Supabase first.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (changedFields.length > 0) {
      await writeSystemConfigAuditLog(supabase, {
        module_id: moduleId,
        config_scope: "business_logic",
        entity_label: moduleLabel,
        action: "created",
        changed_fields: changedFields,
        previous_values: previousValues,
        new_values: newValues,
        performed_by: caller.id,
        performed_by_name: caller.name,
      });
    }

    return NextResponse.json({
      data: {
        ...data,
        businessLogic: parseModuleBusinessLogic(data?.business_logic),
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
