import {
  APPRAISAL_GRADE_BAND_IDS,
  gradeBandForGrade,
  gradeLevelToRank,
  isKnownGrade,
  normalizeGradeId,
  resolveAppraisalGradeBandCovers,
  resolveAppraisalGradeBandLabels,
  resolveGradeLevels,
  type AppraisalGradeBandId,
  type GradeLevelsConfig,
} from "./gradeLevelsConfig";

export type AppraisalScopeMode = "grouped" | "individual";

export type AppraisalScopeConfig = {
  /** grouped = L1, L2_L3, L4, L5_L6_L7 bands. individual = one form per grade. */
  mode?: AppraisalScopeMode;
};

export const DEFAULT_APPRAISAL_SCOPE: AppraisalScopeConfig = { mode: "grouped" };

export function normalizeAppraisalScopeConfig(
  raw: unknown,
): AppraisalScopeConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_APPRAISAL_SCOPE;
  const mode = (raw as Record<string, unknown>).mode;
  if (mode === "individual" || mode === "grouped") return { mode };
  return DEFAULT_APPRAISAL_SCOPE;
}

export function isIndividualAppraisalScope(
  config?: AppraisalScopeConfig,
): boolean {
  return config?.mode === "individual";
}

/** Git SECTIONS_MAP key used when a form key has no direct entry (e.g. L8 → L5_L6_L7). */
export function gitTemplateKeyForFormKey(formKey: string): AppraisalGradeBandId {
  if (
    APPRAISAL_GRADE_BAND_IDS.includes(formKey as AppraisalGradeBandId)
  ) {
    return formKey as AppraisalGradeBandId;
  }

  const rank = gradeLevelToRank(formKey);
  if (rank == null || rank <= 1) return "L1";
  if (rank <= 3) return "L2_L3";
  if (rank === 4) return "L4";
  return "L5_L6_L7";
}

/** Form key stored on appraisals and used in System Definitions editors. */
export function resolveAppraisalFormKey(
  grade: string | null | undefined,
  gradeConfig?: GradeLevelsConfig,
  scopeConfig?: AppraisalScopeConfig,
): string {
  if (isIndividualAppraisalScope(scopeConfig)) {
    const id = normalizeGradeId(grade);
    if (id && isKnownGrade(id, gradeConfig)) return id;
  }
  return gradeBandForGrade(grade, gradeConfig);
}

export function resolveAppraisalFormKeys(
  scopeConfig?: AppraisalScopeConfig,
  gradeConfig?: GradeLevelsConfig,
): string[] {
  if (isIndividualAppraisalScope(scopeConfig)) {
    return resolveGradeLevels(gradeConfig).map((l) => l.id);
  }
  return [...APPRAISAL_GRADE_BAND_IDS];
}

export function resolveAppraisalFormKeyCovers(
  scopeConfig?: AppraisalScopeConfig,
  gradeConfig?: GradeLevelsConfig,
): Record<string, string[]> {
  if (isIndividualAppraisalScope(scopeConfig)) {
    const levels = resolveGradeLevels(gradeConfig);
    return Object.fromEntries(levels.map((l) => [l.id, [l.id]]));
  }
  return resolveAppraisalGradeBandCovers(gradeConfig);
}

export function resolveAppraisalFormKeyLabels(
  scopeConfig?: AppraisalScopeConfig,
  gradeConfig?: GradeLevelsConfig,
): Record<string, string> {
  if (isIndividualAppraisalScope(scopeConfig)) {
    const levels = resolveGradeLevels(gradeConfig);
    return Object.fromEntries(
      levels.map((l) => [l.id, `${l.id} — ${l.label}`]),
    );
  }
  return resolveAppraisalGradeBandLabels(gradeConfig);
}

export function resolveAppraisalFormOptions(
  scopeConfig?: AppraisalScopeConfig,
  gradeConfig?: GradeLevelsConfig,
): { value: string; label: string }[] {
  const keys = resolveAppraisalFormKeys(scopeConfig, gradeConfig);
  const labels = resolveAppraisalFormKeyLabels(scopeConfig, gradeConfig);
  return keys.map((value) => ({
    value,
    label: labels[value] ?? value,
  }));
}

export function isValidAppraisalFormKey(
  key: string,
  scopeConfig?: AppraisalScopeConfig,
  gradeConfig?: GradeLevelsConfig,
): boolean {
  return resolveAppraisalFormKeys(scopeConfig, gradeConfig).includes(key);
}

/** Accept grouped band ids and individual grade ids (L1, L2, …). */
export function isAppraisalFormKeyShape(key: string): boolean {
  if (APPRAISAL_GRADE_BAND_IDS.includes(key as AppraisalGradeBandId)) {
    return true;
  }
  return /^L\d+$/.test(key.trim().toUpperCase());
}
