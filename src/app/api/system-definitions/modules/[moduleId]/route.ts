import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  jsonUnauthorized,
  requireAuth,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import {
  fetchModuleConfig,
  normalizeFormDefinition,
  parseModuleBusinessLogic,
} from "@/lib/systemDefinitions";

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
          sectionWeightRules:
            incomingBl.sectionWeightRules ??
            current.businessLogic.sectionWeightRules,
          sectionBaseWeights:
            incomingBl.sectionBaseWeights ??
            current.businessLogic.sectionBaseWeights,
          globalSectionWeights:
            incomingBl.globalSectionWeights ??
            current.businessLogic.globalSectionWeights,
          sectionContentOverrides:
            incomingBl.sectionContentOverrides ??
            current.businessLogic.sectionContentOverrides,
          annualLeaveCapDays:
            incomingBl.annualLeaveCapDays ??
            current.businessLogic.annualLeaveCapDays,
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
