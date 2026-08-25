import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { disableUserAccount } from "@/lib/careers/disableUserAccount";
import {
  EMPLOYMENT_STATUS_LABELS,
  isExitEmploymentStatus,
  resolveEmploymentStatus,
  type EmploymentStatus,
  type RecruitmentEmployeeRow,
} from "@/lib/careers/employeeStatus";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { updateUserWithColumnFallback } from "@/lib/supabaseUserUpdate";

export type { RecruitmentEmployeeRow };

type UserRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_id: string;
  job_position: string | null;
  grade_level: string | null;
  role: string;
  created_at: string;
  application_id?: string | null;
  employment_status?: string | null;
  platform_invited_at?: string | null;
  is_disabled?: boolean | null;
};

function mergeHrData(
  existing: OnboardingHrData | null | undefined,
  patch: OnboardingHrData,
): OnboardingHrData {
  return { ...(existing ?? {}), ...patch };
}

async function findOnboardingForUser(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  user: {
    application_id?: string | null;
    email: string;
    company_id: string;
  },
): Promise<{ applicationId: string | null; hr: OnboardingHrData | null }> {
  if (!supabaseAdmin) return { applicationId: null, hr: null };

  if (user.application_id) {
    const { data: onboardingRow } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("hr_data")
      .eq("application_id", user.application_id)
      .maybeSingle();
    return {
      applicationId: user.application_id,
      hr: (onboardingRow?.hr_data ?? null) as OnboardingHrData | null,
    };
  }

  const { data: onboardingRows } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("application_id, hr_data");

  for (const row of onboardingRows ?? []) {
    const hr = (row.hr_data ?? {}) as OnboardingHrData;
    const emailMatch =
      hr.company_email?.trim().toLowerCase() === user.email.trim().toLowerCase();
    const idMatch =
      hr.employee_id?.trim().toUpperCase() === user.company_id.trim().toUpperCase();
    if (emailMatch || idMatch) {
      return { applicationId: row.application_id, hr };
    }
  }

  return { applicationId: null, hr: null };
}

async function fetchEmployeeUser(
  supabaseAdmin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
): Promise<{
  user_id: string;
  role: string;
  application_id?: string | null;
  email: string;
  company_id: string;
  is_disabled?: boolean | null;
} | null> {
  const selectAttempts = [
    "user_id, role, application_id, email, company_id, is_disabled",
    "user_id, role, email, company_id, is_disabled",
    "user_id, role, email, company_id",
  ];

  for (const fields of selectAttempts) {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select(fields)
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data) {
      return data as {
        user_id: string;
        role: string;
        application_id?: string | null;
        email: string;
        company_id: string;
        is_disabled?: boolean | null;
      };
    }

    const msg = error?.message?.toLowerCase() ?? "";
    const missingOptional =
      msg.includes("application_id") ||
      msg.includes("is_disabled") ||
      msg.includes("schema cache") ||
      msg.includes("could not find");
    if (!missingOptional) {
      return null;
    }
  }

  return null;
}

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const userSelect =
    "user_id, first_name, last_name, email, company_id, job_position, grade_level, role, created_at, application_id, employment_status, platform_invited_at, is_disabled";

  let usersResult = await supabaseAdmin
    .from("users")
    .select(userSelect)
    .eq("role", "employee")
    .order("created_at", { ascending: false });

  if (usersResult.error) {
    const msg = usersResult.error.message.toLowerCase();
    if (
      msg.includes("application_id") ||
      msg.includes("employment_status") ||
      msg.includes("platform_invited_at")
    ) {
      usersResult = await supabaseAdmin
        .from("users")
        .select(
          "user_id, first_name, last_name, email, company_id, job_position, grade_level, role, created_at, is_disabled",
        )
        .eq("role", "employee")
        .order("created_at", { ascending: false });
    }
  }

  if (usersResult.error) {
    return NextResponse.json({ error: usersResult.error.message }, { status: 500 });
  }

  const { data: onboardingRows, error: onboardingError } = await supabaseAdmin
    .from("onboarding_submissions")
    .select(
      `
      application_id,
      submitted_at,
      hr_data,
      job_applications (
        reference_number,
        role_title,
        email
      )
    `,
    )
    .not("submitted_at", "is", null);

  if (onboardingError) {
    return NextResponse.json({ error: onboardingError.message }, { status: 500 });
  }

  type OnboardingJoin = {
    application_id: string;
    submitted_at: string | null;
    hr_data: OnboardingHrData;
    job_applications: {
      reference_number: string;
      role_title: string;
      email: string;
    } | {
      reference_number: string;
      role_title: string;
      email: string;
    }[] | null;
  };

  const byApplicationId = new Map<string, OnboardingJoin>();
  const byCompanyEmail = new Map<string, OnboardingJoin>();
  const byEmployeeId = new Map<string, OnboardingJoin>();

  for (const row of (onboardingRows ?? []) as OnboardingJoin[]) {
    byApplicationId.set(row.application_id, row);
    const hr = (row.hr_data ?? {}) as OnboardingHrData;
    const email = hr.company_email?.trim().toLowerCase();
    const employeeId = hr.employee_id?.trim().toUpperCase();
    if (email) byCompanyEmail.set(email, row);
    if (employeeId) byEmployeeId.set(employeeId, row);
  }

  const employees: RecruitmentEmployeeRow[] = ((usersResult.data ?? []) as UserRow[])
    .map((user) => {
      let onboarding =
        (user.application_id && byApplicationId.get(user.application_id)) ||
        byCompanyEmail.get(user.email.trim().toLowerCase()) ||
        byEmployeeId.get(user.company_id.trim().toUpperCase()) ||
        null;

      const rawApp = onboarding?.job_applications;
      const app = Array.isArray(rawApp) ? rawApp[0] : rawApp;
      const hr = (onboarding?.hr_data ?? {}) as OnboardingHrData;

      const platformInvitedAt =
        user.platform_invited_at ??
        hr.platform_invited_at ??
        user.created_at ??
        null;

      const employmentStatus = resolveEmploymentStatus({
        employment_status: user.employment_status ?? hr.employment_status,
        platform_invited_at: platformInvitedAt,
        created_at: user.created_at,
      });

      return {
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        company_id: user.company_id,
        job_position: user.job_position,
        grade_level: user.grade_level,
        employment_status: employmentStatus,
        platform_invited_at: platformInvitedAt,
        application_id: user.application_id ?? onboarding?.application_id ?? null,
        reference_number: app?.reference_number ?? null,
        role_title: app?.role_title ?? user.job_position,
        onboarding_submitted_at: onboarding?.submitted_at ?? null,
        is_disabled: !!user.is_disabled || isExitEmploymentStatus(employmentStatus),
        exit_reason: hr.exit_reason ?? null,
        exited_at: hr.exit_at ?? null,
      };
    });

  return NextResponse.json({ success: true, data: employees });
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
    user_id,
    employment_status,
    exit_reason,
  }: {
    user_id?: string;
    employment_status?: EmploymentStatus;
    exit_reason?: string;
  } = await req.json();

  if (!user_id || !employment_status) {
    return NextResponse.json(
      { error: "user_id and employment_status are required." },
      { status: 400 },
    );
  }

  if (!EMPLOYMENT_STATUS_LABELS[employment_status]) {
    return NextResponse.json({ error: "Invalid employment_status." }, { status: 400 });
  }

  if (isExitEmploymentStatus(employment_status) && !exit_reason?.trim()) {
    return NextResponse.json(
      { error: "A reason is required when recording an exit." },
      { status: 400 },
    );
  }

  const user = await fetchEmployeeUser(supabaseAdmin, user_id);

  if (!user) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  if (user.role !== "employee") {
    return NextResponse.json(
      { error: "Only employee accounts can be updated here." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const exiting = isExitEmploymentStatus(employment_status);

  const userPatch: Record<string, unknown> = {
    employment_status,
  };
  if (employment_status === "active") {
    userPatch.probation_completed_at = now;
  }
  if (exiting) {
    userPatch.is_disabled = true;
  }

  const { error: updateError } = await updateUserWithColumnFallback(
    supabaseAdmin,
    user_id,
    userPatch,
  );

  if (
    updateError &&
    !updateError.message.includes("No updatable user columns matched")
  ) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (exiting) {
    const disabled = await disableUserAccount(supabaseAdmin, user_id);
    if (!disabled.ok) {
      return NextResponse.json(
        { error: disabled.error ?? "Failed to disable account." },
        { status: 500 },
      );
    }
  }

  const { applicationId, hr: onboardingHr } = await findOnboardingForUser(
    supabaseAdmin,
    user,
  );

  if (applicationId) {
    const hrPatch: OnboardingHrData = {
      employment_status,
      ...(employment_status === "active" ? { probation_completed_at: now } : {}),
      ...(exiting
        ? {
            exit_reason: exit_reason!.trim(),
            exit_at: now,
          }
        : {}),
    };

    await supabaseAdmin
      .from("onboarding_submissions")
      .update({
        hr_data: mergeHrData(onboardingHr, hrPatch),
      })
      .eq("application_id", applicationId);
  }

  return NextResponse.json({
    success: true,
    data: {
      user_id,
      employment_status,
      is_disabled: exiting || !!user.is_disabled,
    },
  });
}
