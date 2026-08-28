import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpeningBySlug } from "@/lib/careers/openings";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import {
  DEFAULT_COMPANY_EMAIL_DOMAIN,
  normalizeCompanyEmailDomain,
} from "@/lib/systemDefinitions/companyEmailDomain";
import {
  DEFAULT_GRADE_LEVELS,
  gradeLevelToRank as gradeLevelToRankFromConfig,
  resolveGradeLevelOptions,
  resolveGradeLevels,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";

export const GRADE_LEVELS = DEFAULT_GRADE_LEVELS.map((l) => l.id) as readonly string[];
export type GradeLevel = string;

/** @deprecated Prefer resolveGradeLevelOptions(config) when config is available. */
export const GRADE_LEVEL_OPTIONS = resolveGradeLevelOptions();

export function gradeLevelToRank(
  gradeLevel: string | null | undefined,
  config?: GradeLevelsConfig,
): number | null {
  return gradeLevelToRankFromConfig(gradeLevel, config);
}

export function inferGradeLevel(
  roleSlug: string,
  hrData: OnboardingHrData | null | undefined,
  config?: GradeLevelsConfig,
): string | undefined {
  const levels = resolveGradeLevels(config);
  const levelSet = new Set(levels.map((l) => l.id));

  const fromHr = hrData?.grade_level?.trim().toUpperCase();
  if (fromHr && levelSet.has(fromHr)) return fromHr;

  const opening = getOpeningBySlug(roleSlug);
  const key = opening?.interviewGuideKey?.toUpperCase();
  if (key && levelSet.has(key)) return key;

  return undefined;
}

/** Global numeric value for an employee ID (new WF-00042 or legacy WF7-042). */
export function employeeIdNumericValue(id: string): number | null {
  const trimmed = id.trim().toUpperCase();

  const global = trimmed.match(/^WF-(\d{1,6})$/);
  if (global) return Number(global[1]);

  const legacyDashed = trimmed.match(/^WF-?(\d+)-(\d{1,4})$/);
  if (legacyDashed) {
    return Number(legacyDashed[1]) * 10_000 + Number(legacyDashed[2]);
  }

  const legacyCompact = trimmed.match(/^WF(\d+)(\d{2,4})$/);
  if (legacyCompact) {
    return Number(legacyCompact[1]) * 10_000 + Number(legacyCompact[2]);
  }

  return null;
}

/** @deprecated Legacy parser — prefer employeeIdNumericValue for sequencing. */
export function parseEmployeeId(id: string): { rank: number; sequence: number } | null {
  const trimmed = id.trim().toUpperCase();
  const dashed = trimmed.match(/^WF-?(\d+)-(\d{1,4})$/);
  if (dashed) {
    return { rank: Number(dashed[1]), sequence: Number(dashed[2]) };
  }
  const compact = trimmed.match(/^WF(\d+)(\d{2,4})$/);
  if (compact) {
    return { rank: Number(compact[1]), sequence: Number(compact[2]) };
  }
  return null;
}

/** Company-wide employee ID: WF-##### (no grade level encoded). */
export function formatEmployeeId(sequence: number): string {
  const safeSeq = Math.max(1, Math.floor(sequence));
  return `WF-${String(safeSeq).padStart(5, "0")}`;
}

/** Next unique WF ID across the whole company (grade-independent). */
export function suggestEmployeeId(existingIds: string[]): string {
  const values = existingIds
    .map(employeeIdNumericValue)
    .filter((value): value is number => value !== null);

  const nextSequence = values.length > 0 ? Math.max(...values) + 1 : 1;
  return formatEmployeeId(nextSequence);
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
 * Company email local part: {firstNameLetter}.{middleInitial?}{lastName}
 * e.g. Lisa Akoto → l.akoto
 * e.g. Mark Okyei Ofuso → m.oofuso
 *
 * Use `firstNameLetterIndex` to pick which letter from the first name forms
 * the prefix (0 = first letter, 1 = second, …) when resolving duplicates.
 */
export function buildCompanyEmailLocalPart(params: {
  firstName: string;
  middleNames?: string;
  lastName: string;
  firstNameLetterIndex?: number;
}): string | null {
  const first = sanitizeEmailPart(params.firstName);
  const last = sanitizeEmailPart(params.lastName);
  if (!first || !last) return null;

  const letterIndex = params.firstNameLetterIndex ?? 0;
  if (letterIndex < 0 || letterIndex >= first.length) return null;

  const firstInitial = first[letterIndex];
  const middleWord = params.middleNames?.trim().split(/\s+/)[0];
  const middleInitial = middleWord ? sanitizeEmailPart(middleWord)[0] : "";

  return middleInitial
    ? `${firstInitial}.${middleInitial}${last}`
    : `${firstInitial}.${last}`;
}

/**
 * Suggest a unique company email. Starts with the first letter of the first
 * name; if taken (users table or pending onboarding), tries the second letter,
 * then the third, and so on — e.g. Gerome → g.agyeabour, Gregory → r.agyeabour.
 */
export function suggestCompanyEmail(params: {
  firstName: string;
  middleNames?: string;
  lastName: string;
  existingEmails?: string[];
  domain?: string;
}): string | null {
  const first = sanitizeEmailPart(params.firstName);
  const last = sanitizeEmailPart(params.lastName);
  if (!first || !last) return null;

  const domain = normalizeCompanyEmailDomain(
    params.domain ?? DEFAULT_COMPANY_EMAIL_DOMAIN,
  );

  const taken = new Set(
    (params.existingEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
  );

  for (let letterIndex = 0; letterIndex < first.length; letterIndex++) {
    const localPart = buildCompanyEmailLocalPart({
      ...params,
      firstNameLetterIndex: letterIndex,
    });
    if (!localPart) continue;

    const candidate = `${localPart}@${domain}`;
    if (!taken.has(candidate)) return candidate;
  }

  const fallbackLocal = buildCompanyEmailLocalPart(params);
  if (!fallbackLocal) return null;

  for (let n = 2; n <= 99; n++) {
    const candidate = `${fallbackLocal}${n}@${domain}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${fallbackLocal}${Date.now().toString().slice(-4)}@${domain}`;
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
