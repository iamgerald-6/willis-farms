import type { SectionDef } from "./scoring";
import {
  APPRAISAL_GRADE_BAND_IDS,
  canRateGradeLevel,
  gradeBandForGrade as gradeBandForGradeFromConfig,
  gradeIndexInOrder,
  resolveAppraisalGradeBandCovers,
  resolveAppraisalGradeBandLabels,
  resolveAppraisalGradeOptions,
  resolveGradeOrder,
  type AppraisalGradeBandId,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";
import { isSuperAdminRoleLabel, isSupervisoryRoleLabel } from "@/lib/userRoleAccessControl";
import {
  resolveAppraisalFormKeyCovers,
  resolveAppraisalFormKeyLabels,
  resolveAppraisalFormOptions,
  type AppraisalScopeConfig,
} from "@/lib/systemDefinitions/appraisalScopeConfig";

/**
 * Centralised rating-section definitions, shared by the appraisal form,
 * the Final Review Meeting screen, and the read-only detail view.
 *
 * There are exactly 4 quarterly forms per employee per year (Q1–Q4).
 * Q4 = Annual: it uses the fuller "annual" section set below (extra
 * Year-End KPI Summary section, different weight split) — there is no
 * separate Annual tab/form anywhere in the UI.
 */

export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
export const QUARTERS: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];

/** @deprecated Use resolveGradeOrder(config) */
export const GRADE_ORDER = resolveGradeOrder();

export function gradeIndex(
  g: string | null | undefined,
  config?: GradeLevelsConfig,
): number {
  return gradeIndexInOrder(g, config);
}

/**
 * Lowest grade index that triggers L4+ weight rules (index 3 = L4 in default order).
 */
export const MIN_SUPERVISOR_GRADE_INDEX = 3;

export function canRate(
  raterGrade: string | null | undefined,
  targetGrade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  return canRateGradeLevel(raterGrade, targetGrade, config);
}

/** Broad "does this person appraise anyone at all" gate — decides whether
 * to show the "New appraisal" vs. self-assessment-only button. Not a
 * per-employee check (that's canSuperviseAppraisal in appraisal/roles.ts,
 * gated on the actual supervisor_id assignment) — this is Super Admin, or
 * Supervisory Role with at least one person actually assigned to them
 * (hasSupervisees, computed by the caller from the loaded user list). */
export function canAppraiseOthers(
  role: string | null | undefined,
  hasSupervisees: boolean,
): boolean {
  return isSuperAdminRoleLabel(role) || (isSupervisoryRoleLabel(role) && hasSupervisees);
}

export const GRADE_OPTIONS = resolveAppraisalGradeOptions().map((o) => ({
  value: o.value,
  label: o.label,
}));

export const GRADE_BAND_COVERS = resolveAppraisalGradeBandCovers();

export function gradeBandForGrade(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): AppraisalGradeBandId {
  return gradeBandForGradeFromConfig(grade, config);
}

export function supervisableGradeBands(
  raterGrade: string | null | undefined,
  gradeConfig?: GradeLevelsConfig,
  scopeConfig?: AppraisalScopeConfig,
) {
  const options = resolveAppraisalFormOptions(scopeConfig, gradeConfig);
  const covers = resolveAppraisalFormKeyCovers(scopeConfig, gradeConfig);
  return options.filter((opt) => {
    const grades = covers[opt.value] ?? [];
    return grades.some((g) => canRate(raterGrade, g, gradeConfig));
  });
}

export function getAppraisalFormKeyLabels(
  scopeConfig?: AppraisalScopeConfig,
  gradeConfig?: GradeLevelsConfig,
): Record<string, string> {
  return resolveAppraisalFormKeyLabels(scopeConfig, gradeConfig);
}

export function getAppraisalGradeBandLabels(
  config?: GradeLevelsConfig,
): Record<AppraisalGradeBandId, string> {
  return resolveAppraisalGradeBandLabels(config);
}

/** "quarterly" set = Q1–Q3. "annual" set = Q4. */
export type SectionSet = "quarterly" | "annual";

export const SECTION_SET_UI_LABELS: Record<SectionSet, string> = {
  quarterly: "Quarterly",
  annual: "Annual",
};

export function sectionSetForQuarter(quarter: Quarter): SectionSet {
  return quarter === "Q4" ? "annual" : "quarterly";
}

/** Grade bands used in the appraisal rating grid (for System Definitions). */
export const APPRAISAL_GRADE_BANDS = APPRAISAL_GRADE_BAND_IDS;

export type AppraisalGradeBand = AppraisalGradeBandId;

export const APPRAISAL_GRADE_BAND_LABELS = resolveAppraisalGradeBandLabels();
