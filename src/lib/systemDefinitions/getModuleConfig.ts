import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormDefinition } from "@/lib/moduleRegistry/types";
import { DEFAULT_ANNUAL_LEAVE_CAP_DAYS } from "@/lib/leave/leavePolicy";
import {
  DEFAULT_COMPANY_EMAIL_DOMAIN,
  normalizeCompanyEmailDomain,
} from "./companyEmailDomain";
import { DEFAULT_APPRAISAL_SECTION_WEIGHT_RULES } from "./appraisalDefaults";
import {
  formDefinitionForModule,
  mergeFormDefinition,
  normalizeFormDefinition,
} from "./formDefinitionMerge";
import {
  parseModuleBusinessLogic,
  type ModuleBusinessLogic,
} from "./sectionWeightRules";
import { getGitInterviewBenchmarksConfig } from "./interviewBenchmarksConfig";

export type ModuleSystemConfig = {
  businessLogic: ModuleBusinessLogic;
  formDefinition: FormDefinition | null;
};

export async function fetchModuleBusinessLogic(
  supabase: SupabaseClient,
  moduleId: string,
): Promise<ModuleBusinessLogic> {
  const config = await fetchModuleConfig(supabase, moduleId);
  return config.businessLogic;
}

export async function fetchModuleConfig(
  supabase: SupabaseClient,
  moduleId: string,
): Promise<ModuleSystemConfig> {
  const { data, error } = await supabase
    .from("system_modules")
    .select("business_logic, form_definition")
    .eq("module_id", moduleId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return gitFallbackConfig(moduleId);
    }
    throw error;
  }

  const businessLogic = data?.business_logic
    ? parseModuleBusinessLogic(data.business_logic)
    : gitFallbackBusinessLogic(moduleId);

  const gitForm = formDefinitionForModule(moduleId);
  const dbForm = normalizeFormDefinition(data?.form_definition);
  const formDefinition = gitForm
    ? mergeFormDefinition(gitForm, dbForm)
    : dbForm;

  return {
    businessLogic: {
      sectionWeightRules:
        businessLogic.sectionWeightRules?.length
          ? businessLogic.sectionWeightRules
          : gitFallbackBusinessLogic(moduleId).sectionWeightRules,
      sectionBaseWeights: businessLogic.sectionBaseWeights,
      globalSectionWeights: businessLogic.globalSectionWeights,
      sectionContentOverrides: businessLogic.sectionContentOverrides,
      competencyContentOverrides: businessLogic.competencyContentOverrides,
      refereeReferenceConfig: businessLogic.refereeReferenceConfig,
      applicationFormConfig: businessLogic.applicationFormConfig,
      gradeLevelsConfig: businessLogic.gradeLevelsConfig,
      appraisalScopeConfig: businessLogic.appraisalScopeConfig,
      annualLeaveCapDays:
        businessLogic.annualLeaveCapDays ??
        gitFallbackBusinessLogic(moduleId).annualLeaveCapDays,
      companyEmailDomain:
        businessLogic.companyEmailDomain ??
        gitFallbackBusinessLogic(moduleId).companyEmailDomain,
      interviewGuidesConfig: businessLogic.interviewGuidesConfig,
      interviewEvaluationConfig: businessLogic.interviewEvaluationConfig,
      interviewBenchmarksConfig:
        businessLogic.interviewBenchmarksConfig ??
        gitFallbackBusinessLogic(moduleId).interviewBenchmarksConfig,
    },
    formDefinition,
  };
}

function gitFallbackBusinessLogic(moduleId: string): ModuleBusinessLogic {
  if (moduleId === "mod:appraisal") {
    return { sectionWeightRules: DEFAULT_APPRAISAL_SECTION_WEIGHT_RULES };
  }
  if (moduleId === "mod:leave") {
    return { annualLeaveCapDays: DEFAULT_ANNUAL_LEAVE_CAP_DAYS };
  }
  if (moduleId === "mod:recruitment") {
    return {
      companyEmailDomain: DEFAULT_COMPANY_EMAIL_DOMAIN,
      interviewBenchmarksConfig: getGitInterviewBenchmarksConfig(),
    };
  }
  return {};
}

function gitFallbackConfig(moduleId: string): ModuleSystemConfig {
  return {
    businessLogic: gitFallbackBusinessLogic(moduleId),
    formDefinition: formDefinitionForModule(moduleId),
  };
}
