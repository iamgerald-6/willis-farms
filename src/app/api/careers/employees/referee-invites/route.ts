import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireAuth,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { sendRefereeReferenceInvites } from "@/lib/careers/sendRefereeReferenceInvites";

async function resolveApplicationForEmployee(
  supabaseAdmin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
): Promise<{
  application_id: string;
  full_name: string;
  role_title: string;
  reference_number: string;
  application_form_data: Record<string, unknown>;
  employment_status: string | null;
} | null> {
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("user_id, application_id, email, company_id, employment_status")
    .eq("user_id", userId)
    .maybeSingle();

  if (userError || !user) return null;

  let applicationId = user.application_id as string | null;

  if (!applicationId) {
    const { data: onboardingRows } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("application_id, hr_data");

    for (const row of onboardingRows ?? []) {
      const hr = (row.hr_data ?? {}) as {
        company_email?: string;
        employee_id?: string;
      };
      const emailMatch =
        hr.company_email?.trim().toLowerCase() ===
        String(user.email ?? "")
          .trim()
          .toLowerCase();
      const idMatch =
        hr.employee_id?.trim().toUpperCase() ===
        String(user.company_id ?? "")
          .trim()
          .toUpperCase();
      if (emailMatch || idMatch) {
        applicationId = row.application_id;
        break;
      }
    }
  }

  if (!applicationId) return null;

  const { data: app, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select("id, full_name, role_title, reference_number, application_form_data")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError || !app) return null;

  return {
    application_id: app.id,
    full_name: app.full_name,
    role_title: app.role_title,
    reference_number: app.reference_number,
    application_form_data: (app.application_form_data ?? {}) as Record<
      string,
      unknown
    >,
    employment_status: (user.employment_status as string | null) ?? null,
  };
}

/** Manual referee reference invites — probation employees only (HR action). */
export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireAuth(req);
  if (!caller) {
    return jsonForbidden("Forbidden — sign in required.");
  }

  const { user_id }: { user_id?: string } = await req.json();
  if (!user_id?.trim()) {
    return NextResponse.json({ error: "user_id is required." }, { status: 400 });
  }

  try {
    const resolved = await resolveApplicationForEmployee(
      supabaseAdmin,
      user_id.trim(),
    );

    if (!resolved) {
      return NextResponse.json(
        { error: "Employee or linked job application not found." },
        { status: 404 },
      );
    }

    if (resolved.employment_status !== "probation") {
      return NextResponse.json(
        {
          error:
            "Referee emails can only be sent while the employee is on probation.",
        },
        { status: 400 },
      );
    }

    const result = await sendRefereeReferenceInvites(supabaseAdmin, {
      applicationId: resolved.application_id,
      formData: resolved.application_form_data,
      candidateName: resolved.full_name,
      roleTitle: resolved.role_title,
      referenceNumber: resolved.reference_number,
    });

    if (result.sent === 0 && result.errors.length > 0) {
      return NextResponse.json(
        { error: result.errors[0], data: result },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      message:
        result.sent > 0
          ? `Referee invite${result.sent === 1 ? "" : "s"} sent to ${result.sent} address${result.sent === 1 ? "" : "es"}.`
          : result.skipped > 0
            ? "All referees have already submitted — no new invites sent."
            : "No referee invites were sent.",
    });
  } catch (err) {
    console.error("[POST /api/careers/employees/referee-invites]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
