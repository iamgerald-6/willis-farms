import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("onboarding_submissions")
    .select(
      `
      *,
      job_applications (
        id,
        reference_number,
        full_name,
        email,
        phone,
        role_title,
        status,
        interview_form_data
      )
    `,
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { application_id, hr_data }: { application_id: string; hr_data: OnboardingHrData } =
    await req.json();

  if (!application_id) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("onboarding_submissions")
    .update({ hr_data: hr_data ?? {} })
    .eq("application_id", application_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
