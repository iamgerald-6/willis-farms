import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireRecruitmentAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import { ensureMedicalFormTemplate } from "@/lib/medical/medicalTemplates";
import type { MedicalFormTemplateVersion } from "@/lib/medical/medicalFormSchema";

/** GET — global medical form template + version history. */
export async function GET(req: NextRequest) {
  const caller = await requireRecruitmentAccess(req, "view");
  if (!caller) return jsonForbidden("Recruitment view access is required.");

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const template = await ensureMedicalFormTemplate(supabaseAdmin);

  const { data: versions, error } = await supabaseAdmin
    .from("medical_form_template_versions")
    .select("*")
    .eq("template_id", template.id)
    .order("version_number", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      template,
      versions: (versions ?? []) as MedicalFormTemplateVersion[],
    },
  });
}
