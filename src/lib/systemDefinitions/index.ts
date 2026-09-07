export type {
  SystemOption,
  SystemOptionInput,
  SystemOptionRules,
  SystemOptionUpdate,
} from "./types";

export { APPRAISAL_MODULE_ID_CONST } from "./appraisalDefaults";

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
  isEditableInterviewGuidesModule,
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

export { parseModuleBusinessLogic } from "./sectionWeightRules";

export type { ModuleBusinessLogic } from "./sectionWeightRules";

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
  buildGuideOverrideFromResolved,
  listInterviewGuideKeys,
  normalizeInterviewGuidesConfig,
  resolveInterviewGuideFromConfig,
  type DisqualifierDef,
  type ExtraInterviewStageDef,
  type InterviewGuideOverride,
  type InterviewGuidesConfig,
} from "./interviewGuidesConfig";

export {
  DEFAULT_INTERVIEW_EVALUATION_LABELS,
  normalizeInterviewEvaluationConfig,
  resolveInterviewEvaluationLabels,
  type InterviewEvaluationConfig,
} from "./interviewEvaluationConfig";

export {
  DEFAULT_INTERVIEW_BENCHMARKS,
  INTERVIEW_BENCHMARK_FIELD_DEFS,
  formatInterviewBenchmarksForPrompt,
  getGitInterviewBenchmarksConfig,
  normalizeInterviewBenchmarksConfig,
  resolveInterviewBenchmarks,
  validateInterviewBenchmarks,
  type InterviewBenchmarkFieldKey,
  type InterviewBenchmarksConfig,
  type ResolvedInterviewBenchmarks,
} from "./interviewBenchmarksConfig";

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
  gradeIndexInOrder,
  gradeLevelToRank,
  maxGradeRank,
  nextGradeInOrder,
  normalizeGradeLevelsConfig,
  resolveAppraisalGradeBandCovers,
  resolveAppraisalGradeBandLabels,
  resolveAppraisalGradeOptions,
  resolveGradeLevelOptions,
  resolveGradeLevels,
  resolveAllGradeLevels,
  isConsultantGrade,
  CONSULTANT_GRADE_ID,
  DEFAULT_CONSULTANT_GRADES,
  resolveGradeOrder,
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
