import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewGuideConfig, WeightRow } from "@/lib/careers/interviewFormConfigs";
import type { ResolvedInterviewContext } from "@/lib/careers/fetchResolvedInterviewGuide";
import {
  groupBySection,
  normalizePostingInterviewSetup,
  type PostingInterviewSetupContent,
} from "@/lib/careers/postingInterviewSetup";
import { resolveInterviewEvaluationLabels } from "@/lib/systemDefinitions/interviewEvaluationConfig";
import { resolveInterviewBenchmarks } from "@/lib/systemDefinitions/interviewBenchmarksConfig";

/**
 * Turns this posting's question/scenario sections into score weight rows,
 * using the percentages HR set on the Score weighting tab
 * (setup.weights.questionSections/scenarioSections). An area missing its
 * own entry (a section added since weights were last saved, or a setup
 * saved before this feature existed) falls back to an equal share of 100,
 * so score computation (computeStage1Score/computeStage2Score/
 * computeWeightedScore in interviewFormConfigs.ts, which divide by the sum
 * of weights and return a null total when there are none) always has
 * something to work with. Questions and scenarios are grouped and weighted
 * separately so a like-named section on both sides can't mix a scenario id
 * into a Stage 1 row or vice versa — computeStage1Score/computeStage2Score
 * both require a row's ids to be ALL scenario ids or ALL non-scenario ids.
 */
function buildWeightRows(setup: PostingInterviewSetupContent): WeightRow[] {
  const questionGroups = groupBySection(setup.questions, "Questions");
  const scenarioGroups = groupBySection(setup.scenarios, "Practical assessment");

  const resolve = (
    groups: { area: string; ids: string[] }[],
    configured: Record<string, number>,
  ): WeightRow[] => {
    if (groups.length === 0) return [];
    const equalShare = Math.round((100 / groups.length) * 100) / 100;
    return groups.map((g) => ({
      area: g.area,
      questionIds: g.ids,
      weight: typeof configured[g.area] === "number" ? configured[g.area] : equalShare,
    }));
  };

  return [
    ...resolve(questionGroups, setup.weights.questionSections),
    ...resolve(scenarioGroups, setup.weights.scenarioSections),
  ];
}

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
    weights: buildWeightRows(setup),
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
