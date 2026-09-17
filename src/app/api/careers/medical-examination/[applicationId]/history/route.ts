import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireRecruitmentAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import type { MedicalExaminationHistoryEntry } from "@/lib/medical/medicalFormSchema";

/** GET — past examination cycles for this candidate, most recent first.
 * Archived automatically when HR resends a link over an already-sent/
 * submitted examination — see /api/careers/medical-examination/resend. */
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

  const { data: history, error } = await supabaseAdmin
    .from("medical_examination_history")
    .select("*")
    .eq("application_id", applicationId)
    .order("archived_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: { history: (history ?? []) as MedicalExaminationHistoryEntry[] },
  });
}
