export type InterviewEvaluationConfig = {
  observedLabel?: string;
  notObservedLabel?: string;
};

export const DEFAULT_INTERVIEW_EVALUATION_LABELS = {
  observed: "Observed",
  notObserved: "Not observed",
} as const;

export function normalizeInterviewEvaluationConfig(
  raw: unknown,
): InterviewEvaluationConfig {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: InterviewEvaluationConfig = {};

  const observed = String(obj.observedLabel ?? "").trim();
  const notObserved = String(obj.notObservedLabel ?? "").trim();

  if (observed) out.observedLabel = observed;
  if (notObserved) out.notObservedLabel = notObserved;

  return out;
}

export type InterviewEvaluationLabels = {
  observed: string;
  notObserved: string;
};

export function resolveInterviewEvaluationLabels(
  config?: InterviewEvaluationConfig,
): InterviewEvaluationLabels {
  return {
    observed:
      config?.observedLabel?.trim() ||
      DEFAULT_INTERVIEW_EVALUATION_LABELS.observed,
    notObserved:
      config?.notObservedLabel?.trim() ||
      DEFAULT_INTERVIEW_EVALUATION_LABELS.notObserved,
  };
}
