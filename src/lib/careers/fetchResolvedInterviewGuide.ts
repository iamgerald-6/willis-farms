import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { fetchModuleBusinessLogic } from "@/lib/systemDefinitions/getModuleConfig";
import {
  resolveInterviewGuideFromConfig,
  type InterviewGuidesConfig,
} from "@/lib/systemDefinitions/interviewGuidesConfig";
import {
  resolveInterviewEvaluationLabels,
  type InterviewEvaluationConfig,
} from "@/lib/systemDefinitions/interviewEvaluationConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

export type ResolvedInterviewContext = {
  guide: InterviewGuideConfig | null;
  evaluationLabels: ReturnType<typeof resolveInterviewEvaluationLabels>;
  guidesConfig?: InterviewGuidesConfig;
  evaluationConfig?: InterviewEvaluationConfig;
};

export async function fetchResolvedInterviewContext(
  supabase: SupabaseClient,
  guideKey: string | null | undefined,
): Promise<ResolvedInterviewContext> {
  const businessLogic = await fetchModuleBusinessLogic(
    supabase,
    RECRUITMENT_MODULE_ID,
  );
  const guidesConfig = businessLogic.interviewGuidesConfig;
  const evaluationConfig = businessLogic.interviewEvaluationConfig;
  const evaluationLabels = resolveInterviewEvaluationLabels(evaluationConfig);

  if (!guideKey?.trim()) {
    return {
      guide: null,
      evaluationLabels,
      guidesConfig,
      evaluationConfig,
    };
  }

  return {
    guide: resolveInterviewGuideFromConfig(guideKey.trim(), guidesConfig),
    evaluationLabels,
    guidesConfig,
    evaluationConfig,
  };
}

export async function fetchResolvedInterviewGuide(
  supabase: SupabaseClient,
  guideKey: string | null | undefined,
): Promise<InterviewGuideConfig | null> {
  const ctx = await fetchResolvedInterviewContext(supabase, guideKey);
  return ctx.guide;
}
