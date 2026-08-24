import type { User } from "@/types";

export const PLACEHOLDER_SUPERVISOR_LABEL = "Not yet specified";

export function isPlaceholderSupervisor(value?: string | null): boolean {
  const v = value?.trim().toLowerCase();
  return (
    !v ||
    v === PLACEHOLDER_SUPERVISOR_LABEL.toLowerCase() ||
    v === "—" ||
    v === "-"
  );
}

export function resolveSupervisorUser(
  supervisorId: string | null | undefined,
  users: Pick<User, "user_id" | "first_name" | "last_name" | "email">[],
): Pick<User, "user_id" | "first_name" | "last_name" | "email"> | null {
  if (!supervisorId) return null;
  return users.find((u) => u.user_id === supervisorId) ?? null;
}

export function formatSupervisorName(
  user: Pick<User, "first_name" | "last_name"> | null | undefined,
): string | null {
  if (!user) return null;
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || null;
}

/** Resolve display + form values from appraisal row + employee's assigned supervisor. */
export function resolveAppraisalSupervisorFields(
  appraisal: {
    immediate_supervisor?: string | null;
    supervisor_email?: string | null;
    supervisor_id?: string | null;
  },
  employee: Pick<User, "supervisor_id" | "user_id"> | null | undefined,
  users: User[],
): {
  immediate_supervisor: string;
  supervisor_email: string;
  supervisor_id: string | null;
  supervisor_user_id: string | null;
} {
  const assigned = resolveSupervisorUser(employee?.supervisor_id, users);

  if (!isPlaceholderSupervisor(appraisal.immediate_supervisor)) {
    const fromEmail = appraisal.supervisor_email
      ? users.find(
          (u) =>
            u.email?.toLowerCase() === appraisal.supervisor_email?.toLowerCase(),
        )
      : null;
    return {
      immediate_supervisor: appraisal.immediate_supervisor!.trim(),
      supervisor_email: appraisal.supervisor_email ?? fromEmail?.email ?? "",
      supervisor_id:
        appraisal.supervisor_id ?? fromEmail?.user_id ?? assigned?.user_id ?? null,
      supervisor_user_id:
        appraisal.supervisor_id ?? fromEmail?.user_id ?? assigned?.user_id ?? null,
    };
  }

  if (assigned) {
    return {
      immediate_supervisor: formatSupervisorName(assigned) ?? PLACEHOLDER_SUPERVISOR_LABEL,
      supervisor_email: assigned.email ?? "",
      supervisor_id: assigned.user_id,
      supervisor_user_id: assigned.user_id,
    };
  }

  return {
    immediate_supervisor: appraisal.immediate_supervisor ?? "",
    supervisor_email: appraisal.supervisor_email ?? "",
    supervisor_id: appraisal.supervisor_id ?? null,
    supervisor_user_id: appraisal.supervisor_id ?? null,
  };
}

/** Cron-seeded row with no submissions yet — hide from employee list until they start. */
export function isUntouchedAppraisalSeed(appraisal: {
  status?: string | null;
  submitted_by?: string | null;
  employee_ratings?: unknown;
  supervisor_ratings?: unknown;
  employee_submitted_at?: string | null;
  supervisor_submitted_at?: string | null;
}): boolean {
  if (appraisal.status && appraisal.status !== "open") return false;
  if (
    appraisal.submitted_by &&
    appraisal.submitted_by !== "none"
  ) {
    return false;
  }
  if (appraisal.employee_submitted_at || appraisal.supervisor_submitted_at) {
    return false;
  }
  if (
    appraisal.employee_ratings &&
    typeof appraisal.employee_ratings === "object" &&
    Object.keys(appraisal.employee_ratings as object).length > 0
  ) {
    return false;
  }
  if (
    appraisal.supervisor_ratings &&
    typeof appraisal.supervisor_ratings === "object" &&
    Object.keys(appraisal.supervisor_ratings as object).length > 0
  ) {
    return false;
  }
  return true;
}

/** Replace placeholder supervisor fields with the employee's assigned supervisor. */
export function applyResolvedSupervisorToAppraisal<
  T extends {
    company_id?: string | null;
    employee_user_id?: string | null;
    immediate_supervisor?: string | null;
    supervisor_email?: string | null;
    supervisor_id?: string | null;
  },
>(
  appraisal: T,
  users: User[],
): T {
  const employee =
    (appraisal.employee_user_id
      ? users.find((u) => u.user_id === appraisal.employee_user_id)
      : null) ??
    users.find((u) => u.company_id === appraisal.company_id) ??
    null;

  const resolved = resolveAppraisalSupervisorFields(appraisal, employee, users);

  return {
    ...appraisal,
    immediate_supervisor: resolved.immediate_supervisor,
    supervisor_email: resolved.supervisor_email || appraisal.supervisor_email,
    supervisor_id: resolved.supervisor_id ?? appraisal.supervisor_id ?? null,
  };
}
