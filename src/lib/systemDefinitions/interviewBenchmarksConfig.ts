/** Per-stage score thresholds for interview progression and final hire (1–5 scale). */
export type InterviewBenchmarksConfig = {
  /** Combined or stage score for "strong hire / appoint" standing. */
  strongHireMin?: number;
  /** Minimum combined score for HR to confirm hire. */
  hireMin?: number;
  /** Minimum for hold band; below this is do not hire / do not advance. */
  holdMin?: number;
  /** Stage 1 average minimum to recommend advancing to Stage 2. */
  stage1AdvanceMin?: number;
  /** Stage 2 average minimum to proceed to evaluation (advisory for AI). */
  stage2AdvanceMin?: number;
};

export type ResolvedInterviewBenchmarks = {
  strongHireMin: number;
  hireMin: number;
  holdMin: number;
  stage1AdvanceMin: number;
  stage2AdvanceMin: number;
};

export const DEFAULT_INTERVIEW_BENCHMARKS: ResolvedInterviewBenchmarks = {
  strongHireMin: 4.0,
  hireMin: 3.3,
  holdMin: 2.8,
  stage1AdvanceMin: 2.8,
  stage2AdvanceMin: 2.8,
};

function parseBenchmark(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 5) return fallback;
  return Math.round(n * 10) / 10;
}

export function normalizeInterviewBenchmarksConfig(
  raw: unknown,
): InterviewBenchmarksConfig {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: InterviewBenchmarksConfig = {};

  if (obj.strongHireMin != null) {
    out.strongHireMin = parseBenchmark(
      obj.strongHireMin,
      DEFAULT_INTERVIEW_BENCHMARKS.strongHireMin,
    );
  }
  if (obj.hireMin != null) {
    out.hireMin = parseBenchmark(obj.hireMin, DEFAULT_INTERVIEW_BENCHMARKS.hireMin);
  }
  if (obj.holdMin != null) {
    out.holdMin = parseBenchmark(obj.holdMin, DEFAULT_INTERVIEW_BENCHMARKS.holdMin);
  }
  if (obj.stage1AdvanceMin != null) {
    out.stage1AdvanceMin = parseBenchmark(
      obj.stage1AdvanceMin,
      DEFAULT_INTERVIEW_BENCHMARKS.stage1AdvanceMin,
    );
  }
  if (obj.stage2AdvanceMin != null) {
    out.stage2AdvanceMin = parseBenchmark(
      obj.stage2AdvanceMin,
      DEFAULT_INTERVIEW_BENCHMARKS.stage2AdvanceMin,
    );
  }

  return out;
}

export function resolveInterviewBenchmarks(
  config?: InterviewBenchmarksConfig,
): ResolvedInterviewBenchmarks {
  return {
    strongHireMin: parseBenchmark(
      config?.strongHireMin,
      DEFAULT_INTERVIEW_BENCHMARKS.strongHireMin,
    ),
    hireMin: parseBenchmark(config?.hireMin, DEFAULT_INTERVIEW_BENCHMARKS.hireMin),
    holdMin: parseBenchmark(config?.holdMin, DEFAULT_INTERVIEW_BENCHMARKS.holdMin),
    stage1AdvanceMin: parseBenchmark(
      config?.stage1AdvanceMin,
      DEFAULT_INTERVIEW_BENCHMARKS.stage1AdvanceMin,
    ),
    stage2AdvanceMin: parseBenchmark(
      config?.stage2AdvanceMin,
      DEFAULT_INTERVIEW_BENCHMARKS.stage2AdvanceMin,
    ),
  };
}

/** Plain-language block injected into AI interview analysis prompts. */
export function formatInterviewBenchmarksForPrompt(
  benchmarks: ResolvedInterviewBenchmarks,
): string {
  const hireUpper =
    benchmarks.strongHireMin > benchmarks.hireMin
      ? (benchmarks.strongHireMin - 0.1).toFixed(1)
      : benchmarks.hireMin.toFixed(1);

  return [
    "Score benchmarks (weighted 1–5):",
    `- ${benchmarks.strongHireMin}+ : strong hire / appoint`,
    `- ${benchmarks.hireMin}–${hireUpper} : hire / appoint (HR can only confirm "hire" when combined score is at least ${benchmarks.hireMin})`,
    `- ${benchmarks.holdMin}–${(benchmarks.hireMin - 0.1).toFixed(1)} : hold / reserve`,
    `- below ${benchmarks.holdMin} : do not hire / do not advance`,
    "",
    "Stage progression minimums:",
    `- Stage 1 → Stage 2: recommend advance_to_stage2 only when Stage 1 average is at least ${benchmarks.stage1AdvanceMin}/5 (below ${benchmarks.holdMin} strongly favours reject unless notes clearly override)`,
    `- Stage 2 → Evaluation: Stage 2 average should be at least ${benchmarks.stage2AdvanceMin}/5 to support proceeding (same hold band applies)`,
  ].join("\n");
}

export type InterviewBenchmarkFieldKey = keyof ResolvedInterviewBenchmarks;

export const INTERVIEW_BENCHMARK_FIELD_DEFS: {
  key: InterviewBenchmarkFieldKey;
  label: string;
  description: string;
}[] = [
  {
    key: "strongHireMin",
    label: "Strong hire minimum",
    description: "Combined or stage score for “strong hire / appoint”.",
  },
  {
    key: "hireMin",
    label: "Hire minimum",
    description:
      "Minimum combined score for HR to confirm hire. AI must not recommend hire below this.",
  },
  {
    key: "holdMin",
    label: "Hold band floor",
    description:
      "Scores from here up to (but not including) hire minimum are “hold / reserve”. Below this is do not hire / do not advance.",
  },
  {
    key: "stage1AdvanceMin",
    label: "Stage 1 → Stage 2",
    description:
      "Minimum Stage 1 average for AI to recommend advancing to Stage 2.",
  },
  {
    key: "stage2AdvanceMin",
    label: "Stage 2 → Evaluation",
    description:
      "Minimum Stage 2 average for AI to support proceeding to final evaluation.",
  },
];

/** Git / pre-DB defaults exposed for System Definitions display. */
export function getGitInterviewBenchmarksConfig(): InterviewBenchmarksConfig {
  return { ...DEFAULT_INTERVIEW_BENCHMARKS };
}

export function validateInterviewBenchmarks(
  benchmarks: ResolvedInterviewBenchmarks,
): string | null {
  if (benchmarks.holdMin >= benchmarks.hireMin) {
    return "Hold band floor must be lower than the hire minimum.";
  }
  if (benchmarks.hireMin >= benchmarks.strongHireMin) {
    return "Hire minimum must be lower than the strong hire minimum.";
  }
  if (benchmarks.stage1AdvanceMin < benchmarks.holdMin) {
    return "Stage 1 advance minimum should not be below the hold band floor.";
  }
  if (benchmarks.stage2AdvanceMin < benchmarks.holdMin) {
    return "Stage 2 advance minimum should not be below the hold band floor.";
  }
  return null;
}
