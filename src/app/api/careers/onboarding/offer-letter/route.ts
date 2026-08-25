import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";

type OfferLetterFile = {
  secure_url: string;
  public_id: string;
  original_name: string;
};

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const applicationId = req.nextUrl.searchParams.get("application_id");
  if (!applicationId) {
    return NextResponse.json(
      { error: "application_id is required." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("hr_data")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hr = (data?.hr_data ?? {}) as OnboardingHrData;
  return NextResponse.json({
    success: true,
    data: { offer_letter: hr.offer_letter ?? null },
  });
}

export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const {
    application_id,
    offer_letter,
  }: { application_id?: string; offer_letter?: OfferLetterFile } = await req.json();

  if (!application_id || !offer_letter?.secure_url) {
    return NextResponse.json(
      { error: "application_id and offer_letter are required." },
      { status: 400 },
    );
  }

  const { data: application, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select("id, status")
    .eq("id", application_id)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (application.status !== "offer") {
    return NextResponse.json(
      { error: "Offer letter can only be uploaded while the applicant is on Offer." },
      { status: 400 },
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("hr_data")
    .eq("application_id", application_id)
    .maybeSingle();

  const hr = (existing?.hr_data ?? {}) as OnboardingHrData;
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("onboarding_submissions")
    .upsert(
      {
        application_id,
        form_data: {},
        hr_data: {
          ...hr,
          offer_letter,
          offer_letter_uploaded_at: now,
        },
      },
      { onConflict: "application_id" },
    )
    .select("hr_data")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { offer_letter: (data.hr_data as OnboardingHrData).offer_letter ?? null },
  });
}
