import {
  normalizeCompetencyContentOverrides,
  type CompetencyContentOverrides,
} from "./competencyContentOverrides";
import {
  normalizeRefereeReferenceConfig,
  type RefereeReferenceConfig,
} from "./refereeReferenceConfig";
import {
  normalizeApplicationFormConfig,
  type ApplicationFormConfig,
} from "./applicationFormConfig";
import {
  normalizeGradeLevelsConfig,
  type GradeLevelsConfig,
} from "./gradeLevelsConfig";
import {
  normalizeAnnualLeaveCapDays,
} from "@/lib/leave/leavePolicy";
import { normalizeCompanyEmailDomain } from "./companyEmailDomain";
import {
  normalizeAppraisalScopeConfig,
  type AppraisalScopeConfig,
} from "./appraisalScopeConfig";
import {
  normalizeInterviewGuidesConfig,
  type InterviewGuidesConfig,
} from "./interviewGuidesConfig";
import {
  normalizeInterviewEvaluationConfig,
  type InterviewEvaluationConfig,
} from "./interviewEvaluationConfig";
import {
  normalizeInterviewBenchmarksConfig,
  type InterviewBenchmarksConfig,
} from "./interviewBenchmarksConfig";

export interface ModuleBusinessLogic {
  /** Skill log — competency section titles/skills per log type. */
  competencyContentOverrides?: CompetencyContentOverrides;
  /** Recruitment — public referee reference form assessment lines. */
  refereeReferenceConfig?: RefereeReferenceConfig;
  /** Recruitment — job application wizard layout (steps, referee count). */
  applicationFormConfig?: ApplicationFormConfig;
  /** Recruitment — configurable grade levels (L1–L7+) linked to job posting roles. */
  gradeLevelsConfig?: GradeLevelsConfig;
  /** Appraisal — grouped bands vs individual grade-level forms. */
  appraisalScopeConfig?: AppraisalScopeConfig;
  /** Leave module — annual working-day allowance per employee per calendar year. */
  annualLeaveCapDays?: number;
  /** Recruitment — domain for HR-assigned company emails (e.g. willsfarms.com). */
  companyEmailDomain?: string;
  /** Recruitment — interview guide overrides per grade / role key. */
  interviewGuidesConfig?: InterviewGuidesConfig;
  /** Recruitment — evaluation checklist labels (Observed / Not observed). */
  interviewEvaluationConfig?: InterviewEvaluationConfig;
  /** Recruitment — per-stage score thresholds for AI progression and hire decisions. */
  interviewBenchmarksConfig?: InterviewBenchmarksConfig;
}

export function parseModuleBusinessLogic(raw: unknown): ModuleBusinessLogic {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  return {
    competencyContentOverrides: normalizeCompetencyContentOverrides(
      obj.competencyContentOverrides,
    ),
    refereeReferenceConfig: normalizeRefereeReferenceConfig(
      obj.refereeReferenceConfig,
    ),
    applicationFormConfig: normalizeApplicationFormConfig(
      obj.applicationFormConfig,
    ),
    gradeLevelsConfig: normalizeGradeLevelsConfig(obj.gradeLevelsConfig),
    appraisalScopeConfig: normalizeAppraisalScopeConfig(
      obj.appraisalScopeConfig,
    ),
    annualLeaveCapDays:
      obj.annualLeaveCapDays != null
        ? normalizeAnnualLeaveCapDays(obj.annualLeaveCapDays)
        : undefined,
    companyEmailDomain:
      obj.companyEmailDomain != null
        ? normalizeCompanyEmailDomain(obj.companyEmailDomain)
        : undefined,
    interviewGuidesConfig: normalizeInterviewGuidesConfig(
      obj.interviewGuidesConfig,
    ),
    interviewEvaluationConfig: normalizeInterviewEvaluationConfig(
      obj.interviewEvaluationConfig,
    ),
    interviewBenchmarksConfig: normalizeInterviewBenchmarksConfig(
      obj.interviewBenchmarksConfig,
    ),
  };
}
