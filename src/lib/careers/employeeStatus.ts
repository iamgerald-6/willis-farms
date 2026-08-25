export const ACTIVE_EMPLOYMENT_STATUSES = ["probation", "active"] as const;

export const EXIT_EMPLOYMENT_STATUSES = ["fired", "quit", "deceased"] as const;

export const EMPLOYMENT_STATUSES = [
  ...ACTIVE_EMPLOYMENT_STATUSES,
  ...EXIT_EMPLOYMENT_STATUSES,
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export type ExitEmploymentStatus = (typeof EXIT_EMPLOYMENT_STATUSES)[number];

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  probation: "Probation",
  active: "Permanent",
  fired: "Fired",
  quit: "Quit",
  deceased: "Deceased",
};

export const EMPLOYMENT_STATUS_STYLES: Record<EmploymentStatus, string> = {
  probation: "bg-amber-50 text-amber-800 border border-amber-200",
  active: "bg-green-50 text-green-700 border border-green-200",
  fired: "bg-red-50 text-red-700 border border-red-200",
  quit: "bg-gray-100 text-gray-700 border border-gray-200",
  deceased: "bg-slate-100 text-slate-700 border border-slate-200",
};

export const EXIT_EMPLOYMENT_STATUS_LABELS = EXIT_EMPLOYMENT_STATUSES.map(
  (status) => ({
    value: status,
    label: EMPLOYMENT_STATUS_LABELS[status],
  }),
);

/** Default probation period from platform invite (months). */
export const DEFAULT_PROBATION_MONTHS = 3;

export function isExitEmploymentStatus(
  status: string | null | undefined,
): status is ExitEmploymentStatus {
  return (
    status === "fired" || status === "quit" || status === "deceased"
  );
}

export function isActiveEmploymentStatus(
  status: string | null | undefined,
): status is (typeof ACTIVE_EMPLOYMENT_STATUSES)[number] {
  return status === "probation" || status === "active";
}

export function resolveEmploymentStatus(input: {
  employment_status?: string | null;
  platform_invited_at?: string | null;
  created_at?: string | null;
}): EmploymentStatus {
  const raw = input.employment_status;
  if (raw && EMPLOYMENT_STATUS_LABELS[raw as EmploymentStatus]) {
    return raw as EmploymentStatus;
  }
  return "probation";
}

export type RecruitmentEmployeeRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_id: string;
  job_position: string | null;
  grade_level: string | null;
  employment_status: EmploymentStatus;
  platform_invited_at: string | null;
  application_id: string | null;
  reference_number: string | null;
  role_title: string | null;
  onboarding_submitted_at: string | null;
  is_disabled: boolean;
  exit_reason: string | null;
  exited_at: string | null;
};
