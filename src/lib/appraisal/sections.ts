import type { SectionDef } from "./scoring";
import {
  APPRAISAL_GRADE_BAND_IDS,
  gradeBandForGrade as gradeBandForGradeFromConfig,
  resolveAppraisalGradeBandCovers,
  resolveAppraisalGradeBandLabels,
  resolveAppraisalGradeOptions,
  type AppraisalGradeBandId,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";
import { canBeAssignedAsSupervisorByRoleLabel } from "@/lib/userRoleAccessControl";
import {
  resolveAppraisalFormKeyLabels,
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

/** Who may start / fill appraisals for other people — user_role_id only:
 * Supervisory Role, Executive Role, Human Resource, Super Admin. */
export function canAppraiseOthers(
  role: string | null | undefined,
  _hasSupervisees?: boolean,
): boolean {
  return canBeAssignedAsSupervisorByRoleLabel(role);
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
