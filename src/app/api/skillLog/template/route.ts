import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireAuth } from "@/lib/apiRequestAuth";
import { findSkillLogTemplateForPlacement } from "@/lib/skillLog/templates";

export async function GET(req: NextRequest) {
  const caller = await requireAuth(req);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const placement = {
    site_id: searchParams.get("site_id"),
    business_unit_id: searchParams.get("business_unit_id"),
    department_id: searchParams.get("department_id"),
    section_id: searchParams.get("section_id"),
    position_id: searchParams.get("position_id"),
    grade_level_id: searchParams.get("grade_level_id"),
  };

  const template = await findSkillLogTemplateForPlacement(supabaseAdmin, placement);

  const sectionId = template?.section_id ?? placement.section_id;
  const positionId = template?.position_id ?? placement.position_id;

  let section_label: string | null = null;
  if (sectionId) {
    const { data: section } = await supabaseAdmin
      .from("sections")
      .select("label")
      .eq("id", sectionId)
      .maybeSingle();
    section_label = section?.label ?? null;
  }

  let position_label: string | null = null;
  if (positionId) {
    const { data: position } = await supabaseAdmin
      .from("custom_position")
      .select("label")
      .eq("id", positionId)
      .maybeSingle();
    position_label = position?.label ?? null;
  }

  if (!template) {
    return NextResponse.json({
      data: {
        id: null,
        sections: [],
        tier_auth_options: [],
        section_id: sectionId,
        section_label,
        position_label,
      },
    });
  }

  return NextResponse.json({
    data: {
      id: template.id,
      sections: template.sections,
      tier_auth_options: template.tier_auth_options,
      section_id: template.section_id,
      section_label,
      position_label,
    },
  });
}
