import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchEmployeeOnboardingRecord } from "@/lib/careers/fetchEmployeeOnboardingRecord";
import { requireRecruitmentAccess } from "@/lib/apiRequestAuth";
import { assertSiteAccess } from "@/lib/siteAccess";

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

  const userId = req.nextUrl.searchParams.get("user_id")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "user_id is required." }, { status: 400 });
  }

  const selectAttempts = [
    "user_id, application_id, email, company_id, site_id",
    "user_id, email, company_id, site_id",
    "user_id, email, company_id",
  ];

  type EmployeeOnboardingUser = {
    application_id?: string | null;
    email: string;
    company_id: string;
    site_id?: number | null;
  };

  let user: EmployeeOnboardingUser | null = null;

  for (const fields of selectAttempts) {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select(fields)
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) {
      user = data as unknown as EmployeeOnboardingUser;
      break;
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  if (!assertSiteAccess(authedUser, user.site_id ?? null)) {
    return NextResponse.json(
      { error: "Forbidden — this employee isn't at a site you have access to." },
      { status: 403 },
    );
  }

  const record = await fetchEmployeeOnboardingRecord(supabaseAdmin, user);
  if (!record) {
    return NextResponse.json(
      { error: "No onboarding record found for this employee." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: record });
}
