import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireRecruitmentAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import type { MedicalExamination } from "@/lib/medical/medicalFormSchema";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const caller = await requireRecruitmentAccess(req, "view");
  if (!caller) return jsonForbidden("Recruitment view access is required.");

  const { applicationId } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { data: exam } = await supabaseAdmin
    .from("medical_examinations")
    .select("*")
    .eq("application_id", applicationId)
    .maybeSingle();

  return NextResponse.json({ data: { examination: (exam as MedicalExamination | null) ?? null } });
}
