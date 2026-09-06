import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import type { ResolvedInterviewContext } from "@/lib/careers/fetchResolvedInterviewGuide";
import { normalizePostingInterviewSetup } from "@/lib/careers/postingInterviewSetup";
import { resolveInterviewEvaluationLabels } from "@/lib/systemDefinitions/interviewEvaluationConfig";
import { resolveInterviewBenchmarks } from "@/lib/systemDefinitions/interviewBenchmarksConfig";

/**
 * Real interview execution (panel scoring form, Stage 1/2/3 wizard, AI
 * stage-1/final analysis, report generation) used to resolve its content
 * from a shared, grade-keyed guide (see fetchResolvedInterviewGuide.ts),
 * looked up by role slug. It now resolves straight from the specific job
 * posting's own Interview setup instead (job_postings.interview_setup +
 * interview_description/interview_panel_members/
 * interview_duration_minutes — see PostingInterviewSetup.tsx), so every
 * caller of fetchResolvedInterviewContext/fetchResolvedInterviewGuide
 * should call this instead, passing the application's job_posting_id.
 *
 * Returns the same ResolvedInterviewContext shape so downstream code (the
 * panel form, wizard steps, AI prompts, reports) needs no further changes
 * — only where the guide comes from changes, not how it's read.
 *
 * Interview setup has one overall "Approximate duration" field rather than
 * a separate value per stage, so stage1/stage2/stage3 all reuse it.
 */
export async function fetchPostingInterviewContext(
  supabase: SupabaseClient,
  jobPostingId: string | null | undefined,
): Promise<ResolvedInterviewContext> {
  if (!jobPostingId) {
    return {
      guide: null,
      evaluationLabels: resolveInterviewEvaluationLabels(),
      benchmarks: resolveInterviewBenchmarks(),
    };
  }

  const { data: posting } = await supabase
    .from("job_postings")
    .select(
      "title, interview_description, interview_panel_members, interview_duration_minutes, interview_setup",
    )
    .eq("id", jobPostingId)
    .maybeSingle();

  if (!posting) {
    return {
      guide: null,
      evaluationLabels: resolveInterviewEvaluationLabels(),
      benchmarks: resolveInterviewBenchmarks(),
    };
  }

  const setup = normalizePostingInterviewSetup(posting.interview_setup);
  const durationLabel =
    typeof posting.interview_duration_minutes === "number"
      ? `${posting.interview_duration_minutes} minutes`
      : "";

  const guide: InterviewGuideConfig = {
    key: jobPostingId,
    title: posting.title ?? "",
    briefing: posting.interview_description ?? "",
    recommendedPanel: posting.interview_panel_members ?? "",
    duration: durationLabel,
    stageDurations: {
      stage1: durationLabel,
      stage2: durationLabel,
      stage3: durationLabel,
    },
    screening: setup.screening,
    questions: setup.questions,
    scenarios: setup.scenarios,
    weights: [],
    interpretation: "",
    disqualifiers: setup.disqualifiers.map((d) => d.label),
    disqualifierItems: setup.disqualifiers,
    ratingLabels: setup.ratingLabels,
  };

  return {
    guide,
    evaluationLabels: resolveInterviewEvaluationLabels(setup.evaluationLabels),
    benchmarks: setup.benchmarks,
  };
}
