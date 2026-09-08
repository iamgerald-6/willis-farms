import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireSystemDefinitionsAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import {
  normalizeSkillLogTemplateSections,
  normalizeSkillLogTierAuthOptions,
  type SkillLogTemplate,
} from "@/lib/skillLog/templates";

const PLACEMENT_COLUMNS = [
  "site_id",
  "business_unit_id",
  "department_id",
  "section_id",
  "position_id",
  "grade_level_id",
] as const;

function asTemplate(row: SkillLogTemplate): SkillLogTemplate {
  return {
    ...row,
    sections: normalizeSkillLogTemplateSections(row.sections),
    tier_auth_options: normalizeSkillLogTierAuthOptions(row.tier_auth_options),
  };
}

export async function GET(req: NextRequest) {
  const caller = await requireSystemDefinitionsAccess(req, "view");
  if (!caller) {
    return jsonForbidden("System Definitions view access is required.");
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("skill_log_templates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: ((data ?? []) as SkillLogTemplate[]).map(asTemplate),
  });
}

export async function POST(req: NextRequest) {
  const caller = await requireSystemDefinitionsAccess(req, "add");
  if (!caller) {
    return jsonForbidden("System Definitions add access is required.");
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const body = await req.json();
  const placement: Record<string, string> = {};
  for (const col of PLACEMENT_COLUMNS) {
    const value = typeof body[col] === "string" ? body[col].trim() : "";
    if (!value) {
      return NextResponse.json(
        { error: `${col} is required — pick a value for every field.` },
        { status: 400 },
      );
    }
    placement[col] = value;
  }

  const { data: existing } = await supabaseAdmin
    .from("skill_log_templates")
    .select("*")
    .match(placement)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ data: asTemplate(existing as SkillLogTemplate) });
  }

  const { data, error } = await supabaseAdmin
    .from("skill_log_templates")
    .insert([
      {
        ...placement,
        sections: [],
        tier_auth_options: normalizeSkillLogTierAuthOptions(null),
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { data: asTemplate(data as SkillLogTemplate) },
    { status: 201 },
  );
}
