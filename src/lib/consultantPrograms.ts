import type { PagePermissionKey } from "@/lib/pagePermissions";
import {
  isConsultantGrade,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";

/** Consultants may view/review/approve by permission but are never program subjects. */
export function isConsultantEmployee(
  gradeLevel: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  return isConsultantGrade(gradeLevel, config);
}

/** Ranked employees participate as appraisal / skill log / promotion subjects. */
export function canParticipateAsProgramSubject(
  gradeLevel: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  return !isConsultantGrade(gradeLevel, config);
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
