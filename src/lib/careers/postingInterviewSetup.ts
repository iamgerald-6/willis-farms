import type {
  InterviewQuestion,
  ScenarioItem,
  ScreeningItem,
} from "@/lib/careers/interviewFormConfigs";
import { RATING_LABELS } from "@/lib/careers/interviewFormConfigs";
import type {
  DisqualifierDef,
  ExtraInterviewStageDef,
} from "@/lib/systemDefinitions/interviewGuidesConfig";
import type { InterviewEvaluationConfig } from "@/lib/systemDefinitions/interviewEvaluationConfig";
import {
  DEFAULT_INTERVIEW_BENCHMARKS,
  type ResolvedInterviewBenchmarks,
} from "@/lib/systemDefinitions/interviewBenchmarksConfig";

/**
 * Per-posting interview setup — same tab set as the shared, grade-level
 * Interview editor under Recruitment in System Definitions (screening,
 * questions, scenarios, evaluation checklist, rating scale, score
 * benchmarks, extra stages), but scoped to one job posting instead of a
 * shared guide key. Stored as one JSON blob on job_postings.interview_setup
 * (see docs/organizational-structure/job-postings-interview-setup.sql) — the
 * description/panel members/duration fields live in their own top-level
 * columns instead, set on Create job posting's Interview step overview.
 */
/** How much each question-section area and each scenario-section area
 * contributes to the overall score, as a percentage — kept as two separate
 * maps (rather than one, keyed by section name) so a question section and
 * scenario section that happen to share a name are never double counted.
 * Percentages across both maps combined must add up to 100 (enforced on
 * the Score weighting tab); an area missing from its map falls back to an
 * equal share at read time, so older setups saved before this existed
 * (or a section added since weights were last saved) still score fine. */
export type PostingScoreWeights = {
  questionSections: Record<string, number>;
  scenarioSections: Record<string, number>;
};

export type PostingInterviewSetupContent = {
  screening: ScreeningItem[];
  questions: InterviewQuestion[];
  scenarios: ScenarioItem[];
  disqualifiers: DisqualifierDef[];
  ratingLabels: Record<number, string>;
  evaluationLabels: InterviewEvaluationConfig;
  benchmarks: ResolvedInterviewBenchmarks;
  extraStages: ExtraInterviewStageDef[];
  weights: PostingScoreWeights;
};

export function emptyPostingInterviewSetup(): PostingInterviewSetupContent {
  return {
    screening: [],
    questions: [],
    scenarios: [],
    disqualifiers: [],
    ratingLabels: { ...RATING_LABELS },
    evaluationLabels: {},
    benchmarks: { ...DEFAULT_INTERVIEW_BENCHMARKS },
    extraStages: [],
    weights: { questionSections: {}, scenarioSections: {} },
  };
}

/** Groups items (questions or scenarios) by their `section` field, in
 * first-seen order, for scoring purposes — every id in a group is either
 * all question ids or all scenario ids, never mixed, since questions and
 * scenarios are always grouped separately even when a section name is
 * reused on both sides. Used by both the Score weighting tab (to know
 * what areas to show) and fetchPostingInterviewContext.ts (to know what
 * each stored weight refers to when building score rows). */
export function groupBySection<T extends { id: string; section?: string }>(
  items: T[],
  fallbackArea: string,
): { area: string; ids: string[] }[] {
  const map = new Map<string, string[]>();
  for (const item of items) {
    const key = item.section?.trim() || fallbackArea;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item.id);
  }
  return Array.from(map.entries()).map(([area, ids]) => ({ area, ids }));
}

/**
 * This JSON blob is only ever produced by PostingInterviewSetup.tsx's own
 * save, so normalization here is defensive (fills in missing pieces with
 * defaults) rather than the strict field-by-field validation the shared
 * config does for hand-editable/legacy data.
 */
/** Whether a posting has any interview-step content saved (overview fields or setup JSON). */
export function postingHasInterviewSetup(posting: {
  interview_description?: string | null;
  interview_panel_members?: string | null;
  interview_duration_minutes?: number | null;
  interview_setup?: unknown;
}): boolean {
  if (
    !!posting.interview_description?.trim() ||
    !!posting.interview_panel_members?.trim() ||
    posting.interview_duration_minutes != null
  ) {
    return true;
  }
  const setup = normalizePostingInterviewSetup(posting.interview_setup);
  return (
    setup.screening.length > 0 ||
    setup.questions.length > 0 ||
    setup.scenarios.length > 0 ||
    setup.disqualifiers.length > 0 ||
    setup.extraStages.length > 0
  );
}

export function normalizePostingInterviewSetup(raw: unknown): PostingInterviewSetupContent {
  const defaults = emptyPostingInterviewSetup();
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Record<string, unknown>;

  return {
    screening: Array.isArray(obj.screening) ? (obj.screening as ScreeningItem[]) : defaults.screening,
    questions: Array.isArray(obj.questions)
      ? (obj.questions as InterviewQuestion[])
      : defaults.questions,
    scenarios: Array.isArray(obj.scenarios)
      ? (obj.scenarios as ScenarioItem[])
      : defaults.scenarios,
    disqualifiers: Array.isArray(obj.disqualifiers)
      ? (obj.disqualifiers as DisqualifierDef[])
      : defaults.disqualifiers,
    ratingLabels:
      obj.ratingLabels && typeof obj.ratingLabels === "object"
        ? { ...defaults.ratingLabels, ...(obj.ratingLabels as Record<number, string>) }
        : defaults.ratingLabels,
    evaluationLabels:
      obj.evaluationLabels && typeof obj.evaluationLabels === "object"
        ? (obj.evaluationLabels as InterviewEvaluationConfig)
        : defaults.evaluationLabels,
    benchmarks:
      obj.benchmarks && typeof obj.benchmarks === "object"
        ? { ...defaults.benchmarks, ...(obj.benchmarks as Partial<ResolvedInterviewBenchmarks>) }
        : defaults.benchmarks,
    extraStages: Array.isArray(obj.extraStages)
      ? (obj.extraStages as ExtraInterviewStageDef[])
      : defaults.extraStages,
    weights: normalizeWeights(obj.weights, defaults.weights),
  };
}

function normalizeWeights(
  raw: unknown,
  fallback: PostingScoreWeights,
): PostingScoreWeights {
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const questionSections =
    obj.questionSections && typeof obj.questionSections === "object"
      ? (obj.questionSections as Record<string, number>)
      : fallback.questionSections;
  const scenarioSections =
    obj.scenarioSections && typeof obj.scenarioSections === "object"
      ? (obj.scenarioSections as Record<string, number>)
      : fallback.scenarioSections;
  return { questionSections, scenarioSections };
}
