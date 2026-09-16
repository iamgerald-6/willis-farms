import type { PagePermissionKey } from "@/lib/pagePermissions";
import {
  isConsultantGrade,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";
import { isHumanResourceRoleLabel } from "@/lib/userRoleAccessControl";

/**
 * Consultants may view/review/approve by permission but are never program
 * subjects — EXCEPT Human Resource: someone whose role is Human Resource
 * always participates as a program subject (sees/uses their own Appraisal,
 * Skill Log, Promotion self-service), regardless of what grade they happen
 * to be placed at. Role — not the grade the account was set up with —
 * decides this for HR specifically, since it's whether the person is
 * genuinely a consultant that matters, and the "consultant" grade band can
 * be assigned to accounts (including HR staff) for reasons unrelated to
 * that.
 */
export function isConsultantEmployee(
  gradeLevel: string | null | undefined,
  config?: GradeLevelsConfig,
  role?: string | null,
): boolean {
  if (isHumanResourceRoleLabel(role)) return false;
  return isConsultantGrade(gradeLevel, config);
}

/** Ranked employees participate as appraisal / skill log / promotion subjects. */
export function canParticipateAsProgramSubject(
  gradeLevel: string | null | undefined,
  config?: GradeLevelsConfig,
  role?: string | null,
): boolean {
  return !isConsultantEmployee(gradeLevel, config, role);
}

export const CONSULTANT_PROGRAMS_NOTICE =
  "Consultants are not on employee appraisal, skill log, or promotion programs. You can still view and review records when your permissions allow.";

export function consultantSelfServiceBlockedMessage(
  module: "appraisal" | "skillLog" | "promotion",
): string {
  const labels = {
    appraisal: "self-appraisal",
    skillLog: "skill log",
    promotion: "promotion assessment",
  };
  return `Consultants are not on the ${labels[module]} program. You can still view and review other records when your permissions allow.`;
}

export const CONSULTANT_EXCLUDED_PAGE_LABELS: Partial<
  Record<PagePermissionKey, string>
> = {
  "hc:appraisal": "appraisal",
  "hc:justifications": "justification",
  "hc:skillLog": "skill log",
  "hc:promotion": "promotion",
};
