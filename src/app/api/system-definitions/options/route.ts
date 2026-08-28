import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  jsonUnauthorized,
  requireAuth,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import {
  fetchSystemOptions,
  writeSystemConfigAuditLog,
} from "@/lib/systemDefinitions";
import type { SystemOptionRules } from "@/lib/systemDefinitions";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSystemOptionId(
  moduleId: string,
  optionList: string,
  legacyValue: string,
): string {
  const mod = moduleId.replace(/^mod:/, "").replace(/:/g, "-");
  const list = optionList.replace(/\./g, "-");
  return `opt:${mod}:${list}:${slugify(legacyValue)}`;
}

function normalizeRules(raw: unknown): SystemOptionRules {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    ...r,
    requires_document: r.requires_document === true,
    requires_reason: r.requires_reason === true,
  };
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const { searchParams } = new URL(req.url);
    const moduleId = searchParams.get("module_id");
    const optionList = searchParams.get("option_list");
    const includeInactive =
      searchParams.get("include_inactive") === "true";

    if (!moduleId || !optionList) {
      return NextResponse.json(
        { error: "module_id and option_list are required" },
        { status: 400 },
      );
    }

    // Inactive options are admin-only (System Definitions editor)
    if (includeInactive) {
      const admin = await requireSystemDefinitionsAccess(req, "view");
      if (!admin) {
        return jsonForbidden(
          "System Definitions view access is required to list inactive options.",
        );
      }
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const data = await fetchSystemOptions(supabase, moduleId, optionList, {
      includeInactive,
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden(
        "System Definitions add access is required to create options.",
      );
    }

    const body = await req.json();
    const moduleId = body.module_id as string | undefined;
    const optionList = body.option_list as string | undefined;
    const label = (body.label as string | undefined)?.trim();
    const legacyValue = (
      (body.legacy_value as string | undefined)?.trim() || label
    )?.trim();
    const sortOrder =
      typeof body.sort_order === "number" ? body.sort_order : 999;
    const rules = normalizeRules(body.rules);

    if (!moduleId || !optionList || !label || !legacyValue) {
      return NextResponse.json(
        { error: "module_id, option_list, label, and legacy_value are required" },
        { status: 400 },
      );
    }

    const id =
      (body.id as string | undefined)?.trim() ||
      buildSystemOptionId(moduleId, optionList, legacyValue);

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data: existing } = await supabase
      .from("system_options")
      .select("*")
      .eq("module_id", moduleId)
      .eq("option_list", optionList)
      .eq("legacy_value", legacyValue)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("system_options")
        .update({
          label,
          sort_order: sortOrder,
          is_active: true,
          rules,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await writeSystemConfigAuditLog(supabase, {
        module_id: moduleId,
        config_scope: "option",
        entity_key: data.id,
        entity_label: `${optionList} — ${data.label}`,
        action: existing.is_active === false ? "reactivated" : "updated",
        previous_values: {
          label: existing.label,
          legacy_value: existing.legacy_value,
          sort_order: existing.sort_order,
          is_active: existing.is_active,
          rules: existing.rules,
        },
        new_values: {
          label: data.label,
          legacy_value: data.legacy_value,
          sort_order: data.sort_order,
          is_active: data.is_active,
          rules: data.rules,
        },
        performed_by: caller.id,
        performed_by_name: caller.name,
      });

      return NextResponse.json({ data, reactivated: existing.is_active === false });
    }

    const { data, error } = await supabase
      .from("system_options")
      .insert([
        {
          id,
          module_id: moduleId,
          option_list: optionList,
          label,
          legacy_value: legacyValue,
          sort_order: sortOrder,
          is_active: true,
          rules,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error:
              "This option already exists (same internal key). Edit the existing row or use a different key.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await writeSystemConfigAuditLog(supabase, {
      module_id: moduleId,
      config_scope: "option",
      entity_key: data.id,
      entity_label: `${optionList} — ${data.label}`,
      action: "created",
      new_values: {
        label: data.label,
        legacy_value: data.legacy_value,
        sort_order: data.sort_order,
        is_active: data.is_active,
        rules: data.rules,
      },
      performed_by: caller.id,
      performed_by_name: caller.name,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
