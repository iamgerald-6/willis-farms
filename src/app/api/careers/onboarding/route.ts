import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { validateGrossSalaryAgainstBand } from "@/lib/systemDefinitions/salaryRanges";
import { requireRecruitmentAccess } from "@/lib/apiRequestAuth";
import { assertSiteAccess, siteIdFromJoin } from "@/lib/siteAccess";

const ONBOARDING_LIST_STATUSES = ["onboarding"] as const;

function isOnboardingHrComplete(hr: OnboardingHrData | null | undefined): boolean {
  return Boolean(hr?.platform_invited_at?.trim() || hr?.hr_finished_at?.trim());
}

export async function GET(req: NextRequest) {
  const authedUser = await requireRecruitmentAccess(req);
  if (!authedUser) {
    return NextResponse.json(
      { error: "Forbidden — Recruitment view access is required." },
      { status: 403 },
    );
  }

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
      "id, reference_number, full_name, email, phone, role_title, status, location, interview_form_data, application_form_data, job_postings(site_id)",
    )
    .in("status", [...ONBOARDING_LIST_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(200);

  if (appsError) {
    return NextResponse.json({ error: appsError.message }, { status: 500 });
  }

  // Site-scope the visible applications up front — everything downstream
  // (missing-onboarding-row creation, the final filtered list) only ever
  // operates on this already-scoped set, so a SITE-scoped caller never
  // even triggers onboarding_submissions upserts for someone else's site.
  const siteScopedApps = (onboardingApps ?? []).filter((a) =>
    assertSiteAccess(authedUser, siteIdFromJoin(a.job_postings)),
  );

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
  const missingApps = siteScopedApps.filter(
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

  const { data: platformUsers, error: platformUsersError } = await supabaseAdmin
    .from("users")
    .select("application_id")
    .not("application_id", "is", null);

  const invitedApplicationIds = new Set<string>();
  if (!platformUsersError) {
    for (const row of platformUsers ?? []) {
      if (row.application_id) invitedApplicationIds.add(row.application_id as string);
    }
  } else if (
    !platformUsersError.message.toLowerCase().includes("application_id") &&
    !platformUsersError.message.toLowerCase().includes("schema cache")
  ) {
    return NextResponse.json({ error: platformUsersError.message }, { status: 500 });
  }

  const visibleAppIds = new Set(siteScopedApps.map((a) => a.id));
  const filtered = (data ?? []).filter((row) => {
    if (!visibleAppIds.has(row.application_id)) return false;
    const hr = (row.hr_data ?? {}) as OnboardingHrData;
    if (isOnboardingHrComplete(hr)) return false;
    if (invitedApplicationIds.has(row.application_id)) return false;
    return true;
  });

  return NextResponse.json({ success: true, data: filtered });
}

export async function PATCH(req: NextRequest) {
  const authedUser = await requireRecruitmentAccess(req, "edit");
  if (!authedUser) {
    return NextResponse.json(
      { error: "Forbidden — Recruitment edit access is required." },
      { status: 403 },
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const body = await req.json();
  const {
    application_id,
    hr_data,
  }: { application_id?: string; hr_data?: OnboardingHrData } = body;

  if (!application_id) {
    return NextResponse.json(
      { error: "application_id is required." },
      { status: 400 },
    );
  }

  const { data: application, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select("id, status, job_postings(site_id)")
    .eq("id", application_id)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const applicationSiteId = siteIdFromJoin(application.job_postings);
  if (!assertSiteAccess(authedUser, applicationSiteId)) {
    return NextResponse.json(
      { error: "Forbidden — this application isn't at a site you have access to." },
      { status: 403 },
    );
  }

  if (application.status !== "offer" && application.status !== "onboarding") {
    return NextResponse.json(
      { error: "HR data can only be updated during Offer or Onboarding." },
      { status: 400 },
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("hr_data, form_data")
    .eq("application_id", application_id)
    .maybeSingle();

  const mergedHr: OnboardingHrData = {
    ...((existing?.hr_data ?? {}) as OnboardingHrData),
    ...(hr_data ?? {}),
  };

  // Validate gross salary against the linked job posting's own Salary band
  // only. If the posting has no band (salary_band_min/max unset), there's
  // nothing to validate against — skip band validation rather than falling
  // back to the legacy grade-tier pay table.
  if (
    mergedHr.salary_ghs?.trim() &&
    (mergedHr.salary_band_min != null || mergedHr.salary_band_max != null)
  ) {
    const bandCheck = validateGrossSalaryAgainstBand(
      mergedHr.salary_ghs,
      mergedHr.salary_band_min,
      mergedHr.salary_band_max,
    );
    if (!bandCheck.valid) {
      return NextResponse.json({ error: bandCheck.message }, { status: 400 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("onboarding_submissions")
    .upsert(
      {
        application_id,
        form_data: existing?.form_data ?? {},
        hr_data: mergedHr,
      },
      { onConflict: "application_id" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
