export type {
  SystemOption,
  SystemOptionInput,
  SystemOptionRules,
  SystemOptionUpdate,
} from "./types";

export {
  APPRAISAL_MODULE_ID_CONST,
  APPRAISAL_SECTION_AUTH_LIST,
  DEFAULT_APPRAISAL_SECTION_WEIGHT_RULES,
  DEFAULT_SECTION_AUTHORISATION_OPTIONS,
} from "./appraisalDefaults";

import { EDITABLE_BUSINESS_LOGIC_MODULES } from "./optionListKeys";

export {
  EDITABLE_LEAVE_POLICY_MODULES,
  EDITABLE_BUSINESS_LOGIC_MODULES,
  EDITABLE_JOB_POSTING_MODULES,
  EDITABLE_APPLICATION_FORM_MODULES,
  EDITABLE_COMPETENCY_SECTION_MODULES,
  EDITABLE_ONBOARDING_FORM_MODULES,
  EDITABLE_OPTION_LISTS,
  EDITABLE_RATING_SECTION_MODULES,
  EDITABLE_REFEREE_REFERENCE_MODULES,
  isEditableJobPostingModule,
  isEditableApplicationFormModule,
  isEditableOnboardingFormModule,
  isEditableCompetencySectionModule,
  isEditableLeavePolicyModule,
  isEditableOptionList,
  isEditableRatingSectionModule,
  isEditableRefereeReferenceModule,
  registryRefToOptionList,
} from "./optionListKeys";

export {
  getGitFallbackOptionById,
  getGitFallbackOptions,
} from "./gitFallback";

export {
  fetchSystemOptionByLegacyValue,
  fetchSystemOptions,
} from "./getOptions";

export {
  fetchModuleBusinessLogic,
  fetchModuleConfig,
  type ModuleSystemConfig,
} from "./getModuleConfig";

export {
  applySectionWeightRules,
  normalizeSectionWeightRules,
  parseModuleBusinessLogic,
} from "./sectionWeightRules";

export type {
  ModuleBusinessLogic,
  SectionWeightRule,
} from "./sectionWeightRules";

export {
  applySectionBaseWeights,
  getGitSectionWeightDefaults,
  normalizeGlobalSectionWeights,
  normalizeSectionBaseWeights,
  resolveSectionWeight,
} from "./sectionBaseWeights";

export type {
  GlobalSectionWeights,
  SectionBaseWeights,
} from "./sectionBaseWeights";

export {
  applySectionContentOverrides,
  mergeSectionContentPatches,
  normalizeSectionContentOverrides,
} from "./sectionContentOverrides";

export type {
  SectionContentOverrides,
  SectionContentPatch,
} from "./sectionContentOverrides";

export {
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

export {
  buildSkillLogCompetencyRowsFromConfig,
  mergeCompetencyContentPatches,
  normalizeCompetencyContentOverrides,
  resolveSkillLogSectionsForType,
  sectionKeyForIndex,
  type CompetencyContentOverrides,
  type CompetencySectionPatch,
} from "./competencyContentOverrides";

export {
  defaultRefereeAssessmentAttributes,
  normalizeRefereeReferenceConfig,
  resolveRefereeAssessmentAttributes,
  type RefereeAssessmentAttributeDef,
  type RefereeReferenceConfig,
} from "./refereeReferenceConfig";

export {
  DEFAULT_APPRAISAL_SCOPE,
  gitTemplateKeyForFormKey,
  isAppraisalFormKeyShape,
  isIndividualAppraisalScope,
  isValidAppraisalFormKey,
  normalizeAppraisalScopeConfig,
  resolveAppraisalFormKey,
  resolveAppraisalFormKeyCovers,
  resolveAppraisalFormKeyLabels,
  resolveAppraisalFormKeys,
  resolveAppraisalFormOptions,
  type AppraisalScopeConfig,
  type AppraisalScopeMode,
} from "./appraisalScopeConfig";

export {
  APPRAISAL_GRADE_BAND_IDS,
  DEFAULT_GRADE_LEVELS,
  MIN_FULL_APPRAISAL_RANK,
  MIN_SUPERVISOR_RANK,
  canRateGradeLevel,
  gradeBandForGrade,
  gradeBandGroupForGrade,
  gradeIndexInOrder,
  gradeLevelToRank,
  maxGradeRank,
  nextGradeInOrder,
  normalizeGradeLevelsConfig,
  resolveAccessControlBandLabels,
  resolveAppraisalGradeBandCovers,
  resolveAppraisalGradeBandLabels,
  resolveAppraisalGradeOptions,
  resolveGradeLevelOptions,
  resolveGradeLevels,
  resolveGradeOrder,
  resolveGroupPresetLabels,
  resolveInterviewGuideKeys,
  type AppraisalGradeBandId,
  type GradeLevelDef,
  type GradeLevelsConfig,
} from "./gradeLevelsConfig";

export function isEditableBusinessLogicModule(moduleId: string): boolean {
  return EDITABLE_BUSINESS_LOGIC_MODULES.includes(
    moduleId as (typeof EDITABLE_BUSINESS_LOGIC_MODULES)[number],
  );
}

export {
  formDefinitionForModule,
  getGitAppraisalFormDefinition,
  mergeFormDefinition,
  normalizeFormDefinition,
} from "./formDefinitionMerge";

export {
  diffFields,
  writeSystemConfigAuditLog,
  type SystemConfigAuditAction,
  type SystemConfigAuditEntry,
  type SystemConfigAuditScope,
} from "./systemConfigAuditLog";
