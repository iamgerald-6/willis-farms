import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchEmployeeOnboardingRecord } from "@/lib/careers/fetchEmployeeOnboardingRecord";

export async function GET(req: NextRequest) {
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
    "user_id, application_id, email, company_id",
    "user_id, email, company_id",
  ];

  let user: {
    application_id?: string | null;
    email: string;
    company_id: string;
  } | null = null;

  for (const fields of selectAttempts) {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select(fields)
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) {
      user = data as typeof user;
      break;
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
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
