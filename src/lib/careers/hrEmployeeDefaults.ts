import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpeningBySlug } from "@/lib/careers/openings";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";

export const GRADE_LEVELS = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

const GRADE_LEVEL_SET = new Set<string>(GRADE_LEVELS);

export const GRADE_LEVEL_OPTIONS: { value: GradeLevel; label: string }[] = [
  { value: "L1", label: "L1 – Junior (1)" },
  { value: "L2", label: "L2 – Technician (2)" },
  { value: "L3", label: "L3 – Senior (3)" },
  { value: "L4", label: "L4 – Supervisor (4)" },
  { value: "L5", label: "L5 – Asst. Manager (5)" },
  { value: "L6", label: "L6 – Farm Manager (6)" },
  { value: "L7", label: "L7 – Operations (7)" },
];

export function gradeLevelToRank(gradeLevel: string | null | undefined): number | null {
  const normalized = gradeLevel?.trim().toUpperCase();
  if (!normalized) return null;
  const match = normalized.match(/^L?([1-7])$/);
  return match ? Number(match[1]) : null;
}

export function inferGradeLevel(
  roleSlug: string,
  hrData: OnboardingHrData | null | undefined,
): GradeLevel | undefined {
  const fromHr = hrData?.grade_level?.trim().toUpperCase();
  if (fromHr && GRADE_LEVEL_SET.has(fromHr)) return fromHr as GradeLevel;

  const opening = getOpeningBySlug(roleSlug);
  const key = opening?.interviewGuideKey?.toUpperCase();
  if (key && GRADE_LEVEL_SET.has(key)) return key as GradeLevel;

  return undefined;
}

/** Parse WF employee IDs — supports WF7-042, WF-7-042, WF7042 */
export function parseEmployeeId(id: string): { rank: number; sequence: number } | null {
  const trimmed = id.trim().toUpperCase();
  const dashed = trimmed.match(/^WF-?([1-7])-(\d{1,4})$/);
  if (dashed) {
    return { rank: Number(dashed[1]), sequence: Number(dashed[2]) };
  }
  const compact = trimmed.match(/^WF([1-7])(\d{2,4})$/);
  if (compact) {
    return { rank: Number(compact[1]), sequence: Number(compact[2]) };
  }
  return null;
}

export function formatEmployeeId(rank: number, sequence: number): string {
  const safeRank = Math.min(7, Math.max(1, rank));
  const safeSeq = Math.max(1, sequence);
  return `WF${safeRank}-${String(safeSeq).padStart(3, "0")}`;
}

/** Next unique WF ID for a grade rank (1 = L1 junior … 7 = L7 senior). */
export function suggestEmployeeId(
  gradeLevel: string | null | undefined,
  existingIds: string[],
): string | null {
  const rank = gradeLevelToRank(gradeLevel);
  if (!rank) return null;

  const sequences = existingIds
    .map(parseEmployeeId)
    .filter((parsed): parsed is { rank: number; sequence: number } => parsed !== null)
    .filter((parsed) => parsed.rank === rank)
    .map((parsed) => parsed.sequence);

  const nextSequence = sequences.length > 0 ? Math.max(...sequences) + 1 : 1;
  return formatEmployeeId(rank, nextSequence);
}

function sanitizeEmailPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Company email: first initial + middle initial + full surname @willsfarms.com
 * e.g. John Michael Smith → jmsmith@willsfarms.com
 */
export function suggestCompanyEmail(params: {
  firstName: string;
  middleNames?: string;
  lastName: string;
  existingEmails?: string[];
}): string | null {
  const first = sanitizeEmailPart(params.firstName);
  const last = sanitizeEmailPart(params.lastName);
  if (!first || !last) return null;

  const middleInitial = params.middleNames?.trim().split(/\s+/)[0]?.[0] ?? "";
  const middle = middleInitial ? sanitizeEmailPart(middleInitial) : "";
  const localBase = middle ? `${first}${middle}${last}` : `${first}${last}`;

  const taken = new Set(
    (params.existingEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
  );

  let candidate = `${localBase}@willsfarms.com`;
  if (!taken.has(candidate)) return candidate;

  for (let n = 2; n <= 99; n++) {
    candidate = `${localBase}${n}@willsfarms.com`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${localBase}${Date.now().toString().slice(-4)}@willsfarms.com`;
}

export async function collectExistingEmployeeIds(supabaseAdmin: SupabaseClient): Promise<{
  companyIds: string[];
  companyEmails: string[];
}> {
  const companyIds = new Set<string>();
  const companyEmails = new Set<string>();

  const { data: users } = await supabaseAdmin.from("users").select("company_id, email");

  for (const row of users ?? []) {
    if (row.company_id?.trim()) companyIds.add(row.company_id.trim());
    if (row.email?.trim()) companyEmails.add(row.email.trim().toLowerCase());
  }

  const { data: onboardingRows } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("hr_data");

  for (const row of onboardingRows ?? []) {
    const hr = (row.hr_data ?? {}) as OnboardingHrData;
    if (hr.employee_id?.trim()) companyIds.add(hr.employee_id.trim());
    if (hr.company_email?.trim()) companyEmails.add(hr.company_email.trim().toLowerCase());
  }

  return {
    companyIds: [...companyIds],
    companyEmails: [...companyEmails],
  };
}
