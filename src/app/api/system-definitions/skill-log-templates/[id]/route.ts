import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireSystemDefinitionsAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import {
  normalizeSkillLogTemplateSections,
  normalizeSkillLogTierAuthOptions,
  type SkillLogTemplate,
} from "@/lib/skillLog/templates";

function asTemplate(row: SkillLogTemplate): SkillLogTemplate {
  return {
    ...row,
    sections: normalizeSkillLogTemplateSections(row.sections),
    tier_auth_options: normalizeSkillLogTierAuthOptions(row.tier_auth_options),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireSystemDefinitionsAccess(req, "view");
  if (!caller) {
    return jsonForbidden("System Definitions view access is required.");
  }
  const { id } = await params;

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("skill_log_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  return NextResponse.json({ data: asTemplate(data as SkillLogTemplate) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireSystemDefinitionsAccess(req, "edit");
  if (!caller) {
    return jsonForbidden("System Definitions edit access is required.");
  }
  const { id } = await params;

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if ("sections" in body) {
    updates.sections = normalizeSkillLogTemplateSections(body.sections);
  }
  if ("tier_auth_options" in body) {
    updates.tier_auth_options = normalizeSkillLogTierAuthOptions(body.tier_auth_options);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided." }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("skill_log_templates")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: asTemplate(data as SkillLogTemplate) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireSystemDefinitionsAccess(req, "edit");
  if (!caller) {
    return jsonForbidden("System Definitions edit access is required.");
  }
  const { id } = await params;

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { error } = await supabaseAdmin
    .from("skill_log_templates")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
