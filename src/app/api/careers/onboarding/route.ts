import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";

const ONBOARDING_LIST_STATUSES = ["onboarding"] as const;

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const { data: onboardingApps, error: appsError } = await supabaseAdmin
    .from("job_applications")
    .select(
      "id, reference_number, full_name, email, phone, role_title, status, location, interview_form_data, application_form_data",
    )
    .in("status", [...ONBOARDING_LIST_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(200);

  if (appsError) {
    return NextResponse.json({ error: appsError.message }, { status: 500 });
  }

  const { data: existingRows, error: rowsError } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("application_id")
    .limit(500);

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  const existingIds = new Set(
    (existingRows ?? []).map((r) => r.application_id),
  );
  const missingApps = (onboardingApps ?? []).filter(
    (a) => !existingIds.has(a.id),
  );

  for (const app of missingApps) {
    await supabaseAdmin.from("onboarding_submissions").upsert(
      {
        application_id: app.id,
        form_data: {},
        hr_data: {},
      },
      { onConflict: "application_id" },
    );
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
        location,
        interview_form_data,
        application_form_data
      )
    `,
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const visibleAppIds = new Set((onboardingApps ?? []).map((a) => a.id));
  const filtered = (data ?? []).filter((row) =>
    visibleAppIds.has(row.application_id),
  );

  return NextResponse.json({ success: true, data: filtered });
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
    hr_data,
  }: { application_id: string; hr_data: OnboardingHrData } = await req.json();

  if (!application_id) {
    return NextResponse.json(
      { error: "application_id is required." },
      { status: 400 },
    );
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
