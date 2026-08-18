import {
  getSkillLogTypeLegacyValues,
  getSkillLogTypeOptions,
} from "@/lib/moduleRegistry";
import type { SystemOption } from "./types";

export const SKILL_LOG_MODULE_ID = "mod:skill-log";

export const SKILL_LOG_SECTIONS_LIST = "skillLog.sections";
export const SKILL_LOG_TIER_AUTH_LIST = "skillLog.tierAuthorisations";
export const SKILL_LOG_REVIEW_PERIODS_LIST = "skillLog.reviewPeriods";
export const SKILL_LOG_TYPES_LIST = "skillLog.types";

const DEFAULT_SECTIONS = [
  "Breeding",
  "Farrowing",
  "Weaning",
  "Gestation",
  "Nursery",
  "Grower-Finisher",
  "General",
] as const;

const DEFAULT_TIER_AUTH = [
  "None yet",
  "GP",
  "PS",
  "External GGP semen handling",
] as const;

function currentYearReviewPeriods(): string[] {
  const year = new Date().getFullYear();
  return ["Q1", "Q2", "Q3", "Q4"].map((q) => `${q} ${year}`);
}

function toOptions(
  moduleId: string,
  optionList: string,
  labels: readonly string[],
  idPrefix: string,
): SystemOption[] {
  return labels.map((label, index) => ({
    id: `opt:skill-log:${idPrefix}:${index + 1}`,
    module_id: moduleId,
    option_list: optionList,
    label,
    legacy_value: label,
    sort_order: index + 1,
    is_active: true,
    rules: {},
  }));
}

export function getGitSkillLogSectionOptions(): SystemOption[] {
  return toOptions(
    SKILL_LOG_MODULE_ID,
    SKILL_LOG_SECTIONS_LIST,
    DEFAULT_SECTIONS,
    "section",
  );
}

export function getGitSkillLogTierAuthOptions(): SystemOption[] {
  return toOptions(
    SKILL_LOG_MODULE_ID,
    SKILL_LOG_TIER_AUTH_LIST,
    DEFAULT_TIER_AUTH,
    "tier",
  );
}

export function getGitSkillLogReviewPeriodOptions(): SystemOption[] {
  return toOptions(
    SKILL_LOG_MODULE_ID,
    SKILL_LOG_REVIEW_PERIODS_LIST,
    currentYearReviewPeriods(),
    "period",
  );
}

export function getGitSkillLogTypeOptions(): SystemOption[] {
  return getSkillLogTypeOptions().map((o) => ({
    id: o.id,
    module_id: SKILL_LOG_MODULE_ID,
    option_list: SKILL_LOG_TYPES_LIST,
    label: o.label,
    legacy_value: o.legacyValue ?? o.label,
    sort_order: o.sortOrder ?? 0,
    is_active: true,
    rules: {},
  }));
}

export function getGitSkillLogTypeLegacyValues(): string[] {
  return [...getSkillLogTypeLegacyValues()];
}
