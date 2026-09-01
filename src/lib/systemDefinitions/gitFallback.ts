import {
  APPRAISAL_MODULE_ID_CONST,
  APPRAISAL_SECTION_AUTH_LIST,
  DEFAULT_SECTION_AUTHORISATION_OPTIONS,
} from "./appraisalDefaults";
import {
  RECRUITMENT_APPLICATION_FIELDS_LIST,
  RECRUITMENT_JOB_POSTINGS_LIST,
  RECRUITMENT_MODULE_ID,
  getDefaultApplicationFormFields,
} from "./recruitmentDefaults";
import {
  ONBOARDING_DEPARTMENTS_L1L6_LIST,
  ONBOARDING_DEPARTMENTS_L7_LIST,
  ONBOARDING_FIELDS_LIST,
  ONBOARDING_LOCATIONS_LIST,
  ONBOARDING_MEDICAL_REPORTS_LIST,
  getDefaultOnboardingDepartmentsL1L6,
  getDefaultOnboardingDepartmentsL7,
  getDefaultOnboardingFormFields,
  getDefaultOnboardingLocations,
  getDefaultOnboardingMedicalReports,
} from "./onboardingDefaults";
import {
  ONBOARDING_EMPLOYMENT_TYPES_LIST,
  ONBOARDING_HR_FIELDS_LIST,
  ONBOARDING_PAY_FREQUENCIES_LIST,
  getDefaultOnboardingEmploymentTypes,
  getDefaultOnboardingHrFields,
  getDefaultPayFrequencies,
} from "./onboardingHrDefaults";
import {
  SKILL_LOG_MODULE_ID,
  SKILL_LOG_REVIEW_PERIODS_LIST,
  SKILL_LOG_SECTIONS_LIST,
  SKILL_LOG_TIER_AUTH_LIST,
  SKILL_LOG_TYPES_LIST,
  getGitSkillLogReviewPeriodOptions,
  getGitSkillLogSectionOptions,
  getGitSkillLogTierAuthOptions,
  getGitSkillLogTypeOptions,
} from "./skillLogDefaults";
import { getLeaveTypeOptions } from "@/lib/moduleRegistry";
import type { SystemOption, SystemOptionRules } from "./types";

function leaveRulesForLegacyValue(legacyValue: string): SystemOptionRules {
  if (legacyValue === "Sick") return { requires_document: true };
  if (legacyValue === "Other") return { requires_reason: true };
  return {};
}

/** Git-defined defaults when DB has no rows yet (or table not migrated). */
export function getGitFallbackOptions(
  moduleId: string,
  optionList: string,
): SystemOption[] {
  if (moduleId === "mod:leave" && optionList === "leave.types") {
    return getLeaveTypeOptions().map((o) => {
      const legacy = o.legacyValue ?? o.label;
      return {
        id: o.id,
        module_id: moduleId,
        option_list: optionList,
        label: o.label,
        legacy_value: legacy,
        sort_order: o.sortOrder ?? 0,
        is_active: true,
        rules: leaveRulesForLegacyValue(legacy),
      };
    });
  }

  if (
    moduleId === APPRAISAL_MODULE_ID_CONST &&
    optionList === APPRAISAL_SECTION_AUTH_LIST
  ) {
    return DEFAULT_SECTION_AUTHORISATION_OPTIONS;
  }

  if (
    moduleId === RECRUITMENT_MODULE_ID &&
    optionList === RECRUITMENT_APPLICATION_FIELDS_LIST
  ) {
    return getDefaultApplicationFormFields();
  }

  if (moduleId === RECRUITMENT_MODULE_ID && optionList === ONBOARDING_FIELDS_LIST) {
    return getDefaultOnboardingFormFields();
  }

  if (moduleId === RECRUITMENT_MODULE_ID && optionList === ONBOARDING_LOCATIONS_LIST) {
    return getDefaultOnboardingLocations();
  }

  if (
    moduleId === RECRUITMENT_MODULE_ID &&
    optionList === ONBOARDING_DEPARTMENTS_L1L6_LIST
  ) {
    return getDefaultOnboardingDepartmentsL1L6();
  }

  if (
    moduleId === RECRUITMENT_MODULE_ID &&
    optionList === ONBOARDING_DEPARTMENTS_L7_LIST
  ) {
    return getDefaultOnboardingDepartmentsL7();
  }

  if (
    moduleId === RECRUITMENT_MODULE_ID &&
    optionList === ONBOARDING_HR_FIELDS_LIST
  ) {
    return getDefaultOnboardingHrFields();
  }

  if (
    moduleId === RECRUITMENT_MODULE_ID &&
    optionList === ONBOARDING_EMPLOYMENT_TYPES_LIST
  ) {
    return getDefaultOnboardingEmploymentTypes();
  }

  if (
    moduleId === RECRUITMENT_MODULE_ID &&
    optionList === ONBOARDING_PAY_FREQUENCIES_LIST
  ) {
    return getDefaultPayFrequencies();
  }

  if (
    moduleId === RECRUITMENT_MODULE_ID &&
    optionList === ONBOARDING_MEDICAL_REPORTS_LIST
  ) {
    return getDefaultOnboardingMedicalReports();
  }

  if (
    moduleId === RECRUITMENT_MODULE_ID &&
    (optionList === RECRUITMENT_JOB_POSTINGS_LIST ||
      optionList === "careers.jobTitles")
  ) {
    return [];
  }

  if (moduleId === SKILL_LOG_MODULE_ID) {
    if (optionList === SKILL_LOG_SECTIONS_LIST) {
      return getGitSkillLogSectionOptions();
    }
    if (optionList === SKILL_LOG_TIER_AUTH_LIST) {
      return getGitSkillLogTierAuthOptions();
    }
    if (optionList === SKILL_LOG_REVIEW_PERIODS_LIST) {
      return getGitSkillLogReviewPeriodOptions();
    }
    if (optionList === SKILL_LOG_TYPES_LIST) {
      return getGitSkillLogTypeOptions();
    }
  }

  return [];
}

export function getGitFallbackOptionById(id: string): SystemOption | null {
  const decoded = decodeURIComponent(id);
  for (const [moduleId, lists] of Object.entries({
    "mod:leave": ["leave.types"],
    [APPRAISAL_MODULE_ID_CONST]: [APPRAISAL_SECTION_AUTH_LIST],
    [RECRUITMENT_MODULE_ID]: [
      RECRUITMENT_APPLICATION_FIELDS_LIST,
      RECRUITMENT_JOB_POSTINGS_LIST,
      ONBOARDING_FIELDS_LIST,
      ONBOARDING_HR_FIELDS_LIST,
      ONBOARDING_EMPLOYMENT_TYPES_LIST,
      ONBOARDING_LOCATIONS_LIST,
      ONBOARDING_DEPARTMENTS_L1L6_LIST,
      ONBOARDING_DEPARTMENTS_L7_LIST,
      ONBOARDING_MEDICAL_REPORTS_LIST,
    ],
    [SKILL_LOG_MODULE_ID]: [
      SKILL_LOG_TYPES_LIST,
      SKILL_LOG_SECTIONS_LIST,
      SKILL_LOG_TIER_AUTH_LIST,
      SKILL_LOG_REVIEW_PERIODS_LIST,
    ],
  })) {
    for (const optionList of lists) {
      const match = getGitFallbackOptions(moduleId, optionList).find(
        (o) => o.id === decoded || o.id === id,
      );
      if (match) return match;
    }
  }
  return null;
}
