import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import {
  getGitFallbackOptionById,
  type SystemOptionRules,
} from "@/lib/systemDefinitions";

function normalizeRules(raw: unknown): SystemOptionRules | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    requires_document: r.requires_document === true,
    requires_reason: r.requires_reason === true,
  };
}

function decodeOptionId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "edit");
    if (!caller) {
      return jsonForbidden(
        "System Definitions edit access is required to change options.",
      );
    }

    const { id: rawId } = await params;
    const id = decodeOptionId(rawId);
    const body = await req.json();

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.label !== undefined) patch.label = String(body.label).trim();
    if (body.legacy_value !== undefined) {
      patch.legacy_value = String(body.legacy_value).trim();
    }
    if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
    if (body.rules !== undefined) patch.rules = normalizeRules(body.rules);

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("system_options")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (updateError) {
      if (
        updateError.code === "42P01" ||
        updateError.message?.includes("does not exist")
      ) {
        return NextResponse.json(
          {
            error:
              "The system_options table is not set up yet. Run docs/system-definitions/schema.sql in Supabase first.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (updated) {
      return NextResponse.json({ data: updated });
    }

    // Built-in options may only exist in Git until first save — seed the row.
    const gitOption = getGitFallbackOptionById(id);
    if (!gitOption) {
      return NextResponse.json({ error: "Option not found" }, { status: 404 });
    }

    const row = {
      id: gitOption.id,
      module_id: gitOption.module_id,
      option_list: gitOption.option_list,
      label: (patch.label as string | undefined) ?? gitOption.label,
      legacy_value:
        (patch.legacy_value as string | undefined) ??
        gitOption.legacy_value ??
        gitOption.label,
      sort_order:
        (patch.sort_order as number | undefined) ?? gitOption.sort_order,
      is_active:
        patch.is_active !== undefined
          ? Boolean(patch.is_active)
          : gitOption.is_active,
      rules: (patch.rules as SystemOptionRules | undefined) ?? gitOption.rules,
      updated_at: patch.updated_at,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("system_options")
      .upsert(row, { onConflict: "id" })
      .select()
      .maybeSingle();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (!inserted) {
      return NextResponse.json(
        { error: "Could not save option" },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: inserted });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
