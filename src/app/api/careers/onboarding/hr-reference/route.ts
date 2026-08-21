import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchOnboardingHrReferenceContext } from "@/lib/careers/sendRefereeReferenceInvites";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const applicationId = req.nextUrl.searchParams.get("application_id");
  if (!applicationId) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  try {
    const data = await fetchOnboardingHrReferenceContext(supabaseAdmin, applicationId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[GET /api/careers/onboarding/hr-reference]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
