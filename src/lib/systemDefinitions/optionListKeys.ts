/**
 * Maps registry taxonomyRefs (Git) to DB option_list keys (plain English).
 * taxonomy.leave.types → leave.types
 */
export function registryRefToOptionList(ref: string): string {
  if (ref.startsWith("taxonomy.")) {
    return ref.slice("taxonomy.".length);
  }
  return ref;
}

/** Modules whose dropdown options are editable in System Definitions (pilot rollout). */
export const EDITABLE_OPTION_LISTS: Partial<
  Record<string, readonly string[]>
> = {
  "mod:leave": ["leave.types"],
  "mod:appraisal": ["appraisal.sectionAuthorisations"],
  "mod:skill-log": [
    "skillLog.types",
    "skillLog.sections",
    "skillLog.tierAuthorisations",
    "skillLog.reviewPeriods",
  ],
};

/** Modules with editable leave policy (annual cap, etc.). */
export const EDITABLE_LEAVE_POLICY_MODULES = ["mod:leave"] as const;

export function isEditableLeavePolicyModule(moduleId: string): boolean {
  return EDITABLE_LEAVE_POLICY_MODULES.includes(
    moduleId as (typeof EDITABLE_LEAVE_POLICY_MODULES)[number],
  );
}

/** Modules with editable business logic (weight rules, etc.). */
export const EDITABLE_BUSINESS_LOGIC_MODULES = ["mod:appraisal"] as const;

/** Modules whose competency sections can be edited in System Definitions. */
export const EDITABLE_COMPETENCY_SECTION_MODULES = ["mod:skill-log"] as const;

export function isEditableCompetencySectionModule(moduleId: string): boolean {
  return EDITABLE_COMPETENCY_SECTION_MODULES.includes(
    moduleId as (typeof EDITABLE_COMPETENCY_SECTION_MODULES)[number],
  );
}

/** Modules whose rating sections can be edited in System Definitions. */
export const EDITABLE_RATING_SECTION_MODULES = ["mod:appraisal"] as const;

export function isEditableRatingSectionModule(moduleId: string): boolean {
  return EDITABLE_RATING_SECTION_MODULES.includes(
    moduleId as (typeof EDITABLE_RATING_SECTION_MODULES)[number],
  );
}

export function isEditableOptionList(
  moduleId: string,
  optionList: string,
): boolean {
  const lists = EDITABLE_OPTION_LISTS[moduleId];
  return lists?.includes(optionList) ?? false;
}
