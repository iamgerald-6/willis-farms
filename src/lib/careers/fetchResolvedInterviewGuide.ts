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
import {
  resolveInterviewBenchmarks,
  type InterviewBenchmarksConfig,
  type ResolvedInterviewBenchmarks,
} from "@/lib/systemDefinitions/interviewBenchmarksConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

export type ResolvedInterviewContext = {
  guide: InterviewGuideConfig | null;
  evaluationLabels: ReturnType<typeof resolveInterviewEvaluationLabels>;
  benchmarks: ResolvedInterviewBenchmarks;
  guidesConfig?: InterviewGuidesConfig;
  evaluationConfig?: InterviewEvaluationConfig;
  benchmarksConfig?: InterviewBenchmarksConfig;
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
  const benchmarksConfig = businessLogic.interviewBenchmarksConfig;
  const evaluationLabels = resolveInterviewEvaluationLabels(evaluationConfig);
  const benchmarks = resolveInterviewBenchmarks(benchmarksConfig);

  if (!guideKey?.trim()) {
    return {
      guide: null,
      evaluationLabels,
      benchmarks,
      guidesConfig,
      evaluationConfig,
      benchmarksConfig,
    };
  }

  return {
    guide: resolveInterviewGuideFromConfig(guideKey.trim(), guidesConfig),
    evaluationLabels,
    benchmarks,
    guidesConfig,
    evaluationConfig,
    benchmarksConfig,
  };
}

export async function fetchResolvedInterviewGuide(
  supabase: SupabaseClient,
  guideKey: string | null | undefined,
): Promise<InterviewGuideConfig | null> {
  const ctx = await fetchResolvedInterviewContext(supabase, guideKey);
  return ctx.guide;
}
