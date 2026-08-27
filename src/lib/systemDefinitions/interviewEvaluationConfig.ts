export type InterviewEvaluationConfig = {
  observedLabel?: string;
  notObservedLabel?: string;
  neutralLabel?: string;
};

export const DEFAULT_INTERVIEW_EVALUATION_LABELS = {
  observed: "Observed",
  notObserved: "Not observed",
  neutral: "—",
} as const;

export function normalizeInterviewEvaluationConfig(
  raw: unknown,
): InterviewEvaluationConfig {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: InterviewEvaluationConfig = {};

  const observed = String(obj.observedLabel ?? "").trim();
  const notObserved = String(obj.notObservedLabel ?? "").trim();
  const neutral = String(obj.neutralLabel ?? "").trim();

  if (observed) out.observedLabel = observed;
  if (notObserved) out.notObservedLabel = notObserved;
  if (neutral) out.neutralLabel = neutral;

  return out;
}

export type InterviewEvaluationLabels = {
  observed: string;
  notObserved: string;
  neutral: string;
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
    neutral:
      config?.neutralLabel?.trim() ||
      DEFAULT_INTERVIEW_EVALUATION_LABELS.neutral,
  };
}
