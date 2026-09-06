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
export type PostingInterviewSetupContent = {
  screening: ScreeningItem[];
  questions: InterviewQuestion[];
  scenarios: ScenarioItem[];
  disqualifiers: DisqualifierDef[];
  ratingLabels: Record<number, string>;
  evaluationLabels: InterviewEvaluationConfig;
  benchmarks: ResolvedInterviewBenchmarks;
  extraStages: ExtraInterviewStageDef[];
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
  };
}

/**
 * This JSON blob is only ever produced by PostingInterviewSetup.tsx's own
 * save, so normalization here is defensive (fills in missing pieces with
 * defaults) rather than the strict field-by-field validation the shared
 * config does for hand-editable/legacy data.
 */
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
  };
}
