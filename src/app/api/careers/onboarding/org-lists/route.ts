import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchOnboardingSiteAndDepartmentLabels } from "@/lib/systemDefinitions/onboardingDefaults";

/**
 * Live "Work location" and "Department" options for HR onboarding
 * (Section O) — sourced directly from the Organizational Structure Sites /
 * Departments catalog, so renaming or adding a site/department there is
 * reflected here immediately instead of drifting from a separate,
 * hand-typed onboarding list.
 */
export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const data = await fetchOnboardingSiteAndDepartmentLabels(supabaseAdmin);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[GET /api/careers/onboarding/org-lists]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
