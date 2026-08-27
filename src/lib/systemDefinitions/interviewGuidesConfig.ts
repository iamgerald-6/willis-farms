import type {
  InterviewGuideConfig,
  InterviewQuestion,
  ScenarioItem,
  ScreeningItem,
  StageDurations,
  WeightRow,
} from "@/lib/careers/interviewFormConfigs";
import {
  getGitInterviewGuide,
  GIT_INTERVIEW_GUIDE_KEYS,
  RATING_LABELS,
} from "@/lib/careers/interviewFormConfigs";
import type { InterviewGuideKey } from "@/lib/careers/openings";

export type DisqualifierDef = {
  id: string;
  label: string;
};

export type ExtraInterviewStageDef = {
  id: string;
  label: string;
  duration?: string;
  /** Reserved for future recruitment wiring (panel setup + review). */
  hasPanelSetup?: boolean;
  hasReviewStep?: boolean;
};

export type InterviewGuideOverride = {
  key: string;
  title?: string;
  grade?: string;
  briefing?: string;
  recommendedPanel?: string;
  duration?: string;
  stageDurations?: Partial<StageDurations>;
  screening?: ScreeningItem[];
  questions?: InterviewQuestion[];
  scenarios?: ScenarioItem[];
  weights?: WeightRow[];
  disqualifiers?: DisqualifierDef[];
  ratingLabels?: Record<number, string>;
  /** When true, Git defaults are ignored for this key (DB-only guide). */
  dbOnly?: boolean;
};

export type InterviewGuidesConfig = {
  guides?: InterviewGuideOverride[];
  extraStages?: ExtraInterviewStageDef[];
};

function slugifyId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

function normalizeScreening(raw: unknown): ScreeningItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ScreeningItem[] = [];
  const usedIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const requirement = String(row.requirement ?? "").trim();
    if (!requirement) continue;
    let id = String(row.id ?? "").trim();
    if (!id) id = `A${out.length + 1}`;
    while (usedIds.has(id)) id = `${id}_${out.length + 1}`;
    usedIds.add(id);
    out.push({
      id,
      requirement,
      mandatory: row.mandatory === true,
    });
  }

  return out.length ? out : undefined;
}

function normalizeQuestions(raw: unknown): InterviewQuestion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: InterviewQuestion[] = [];
  const usedIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const question = String(row.question ?? "").trim();
    const section = String(row.section ?? "").trim();
    const lookFor = String(row.lookFor ?? row.look_for ?? "").trim();
    if (!question) continue;
    let id = String(row.id ?? "").trim();
    if (!id) id = `Q${out.length + 1}`;
    while (usedIds.has(id)) id = `${id}_${out.length + 1}`;
    usedIds.add(id);
    out.push({ id, section: section || "General", question, lookFor });
  }

  return out.length ? out : undefined;
}

function normalizeScenarios(raw: unknown): ScenarioItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ScenarioItem[] = [];
  const usedIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? "").trim();
    const section = String(row.section ?? "").trim();
    const observe = String(row.observe ?? "").trim();
    if (!title) continue;
    let id = String(row.id ?? "").trim();
    if (!id) id = `P${out.length + 1}`;
    while (usedIds.has(id)) id = `${id}_${out.length + 1}`;
    usedIds.add(id);
    out.push({ id, section: section || "Section C", title, observe });
  }

  return out.length ? out : undefined;
}

function normalizeWeights(raw: unknown): WeightRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WeightRow[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const area = String(row.area ?? "").trim();
    const weight = Number(row.weight);
    const questionIdsRaw = row.questionIds ?? row.question_ids;
    if (!area || !Number.isFinite(weight)) continue;
    const questionIds = Array.isArray(questionIdsRaw)
      ? questionIdsRaw.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (!questionIds.length) continue;
    out.push({ area, questionIds, weight });
  }

  return out.length ? out : undefined;
}

function normalizeDisqualifiers(raw: unknown): DisqualifierDef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DisqualifierDef[] = [];
  const usedIds = new Set<string>();

  for (const item of raw) {
    if (typeof item === "string") {
      const label = item.trim();
      if (!label) continue;
      let id = slugifyId(label) || `dq_${out.length + 1}`;
      while (usedIds.has(id)) id = `${id}_${out.length + 1}`;
      usedIds.add(id);
      out.push({ id, label });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = String(row.label ?? "").trim();
    if (!label) continue;
    let id = String(row.id ?? "").trim();
    if (!id) id = slugifyId(label) || `dq_${out.length + 1}`;
    while (usedIds.has(id)) id = `${id}_${out.length + 1}`;
    usedIds.add(id);
    out.push({ id, label });
  }

  return out.length ? out : undefined;
}

function normalizeRatingLabels(raw: unknown): Record<number, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<number, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const rating = Number(key);
    const label = String(value ?? "").trim();
    if (rating >= 1 && rating <= 5 && label) out[rating] = label;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeExtraStages(raw: unknown): ExtraInterviewStageDef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ExtraInterviewStageDef[] = [];
  const usedIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = String(row.label ?? "").trim();
    if (!label) continue;
    let id = String(row.id ?? "").trim();
    if (!id) id = slugifyId(label) || `stage_${out.length + 1}`;
    while (usedIds.has(id)) id = `${id}_${out.length + 1}`;
    usedIds.add(id);
    out.push({
      id,
      label,
      duration: row.duration != null ? String(row.duration).trim() : undefined,
      hasPanelSetup: row.hasPanelSetup === true,
      hasReviewStep: row.hasReviewStep === true,
    });
  }

  return out.length ? out : undefined;
}

export function normalizeInterviewGuidesConfig(raw: unknown): InterviewGuidesConfig {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const guidesRaw = obj.guides;
  if (!Array.isArray(guidesRaw)) {
    const extraStages = normalizeExtraStages(obj.extraStages);
    return extraStages ? { extraStages } : {};
  }

  const guides: InterviewGuideOverride[] = [];
  const usedKeys = new Set<string>();

  for (const item of guidesRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = String(row.key ?? "")
      .trim()
      .replace(/\s+/g, "_");
    if (!key || usedKeys.has(key)) continue;
    usedKeys.add(key);

    const guide: InterviewGuideOverride = { key };
    const title = String(row.title ?? "").trim();
    const grade = String(row.grade ?? "").trim();
    const briefing = String(row.briefing ?? "").trim();
    const recommendedPanel = String(row.recommendedPanel ?? row.recommended_panel ?? "").trim();
    const duration = String(row.duration ?? "").trim();

    if (title) guide.title = title;
    if (grade) guide.grade = grade;
    if (briefing) guide.briefing = briefing;
    if (recommendedPanel) guide.recommendedPanel = recommendedPanel;
    if (duration) guide.duration = duration;
    if (row.dbOnly === true) guide.dbOnly = true;

    const stageDurationsRaw = row.stageDurations ?? row.stage_durations;
    if (stageDurationsRaw && typeof stageDurationsRaw === "object") {
      const sd = stageDurationsRaw as Record<string, unknown>;
      guide.stageDurations = {
        stage1: sd.stage1 != null ? String(sd.stage1).trim() : undefined,
        stage2: sd.stage2 != null ? String(sd.stage2).trim() : undefined,
        stage3: sd.stage3 != null ? String(sd.stage3).trim() : undefined,
      };
    }

    const screening = normalizeScreening(row.screening);
    const questions = normalizeQuestions(row.questions);
    const scenarios = normalizeScenarios(row.scenarios);
    const weights = normalizeWeights(row.weights);
    const disqualifiers = normalizeDisqualifiers(row.disqualifiers);
    const ratingLabels = normalizeRatingLabels(row.ratingLabels ?? row.rating_labels);

    if (screening) guide.screening = screening;
    if (questions) guide.questions = questions;
    if (scenarios) guide.scenarios = scenarios;
    if (weights) guide.weights = weights;
    if (disqualifiers) guide.disqualifiers = disqualifiers;
    if (ratingLabels) guide.ratingLabels = ratingLabels;

    guides.push(guide);
  }

  const extraStages = normalizeExtraStages(obj.extraStages);
  return guides.length || extraStages
    ? { guides: guides.length ? guides : undefined, extraStages }
    : {};
}

function guideKeySort(a: string, b: string): number {
  const aMatch = /^L(\d+)$/.exec(a);
  const bMatch = /^L(\d+)$/.exec(b);
  if (aMatch && bMatch) {
    return Number(aMatch[1]) - Number(bMatch[1]);
  }
  if (aMatch) return -1;
  if (bMatch) return 1;
  return a.localeCompare(b);
}

export function listInterviewGuideKeys(
  config?: InterviewGuidesConfig,
  gradeLevelIds?: string[],
  extraKeys?: string[],
): string[] {
  const keys = new Set<string>(GIT_INTERVIEW_GUIDE_KEYS);
  for (const id of gradeLevelIds ?? []) {
    const trimmed = id.trim();
    if (trimmed) keys.add(trimmed);
  }
  for (const guide of config?.guides ?? []) {
    if (guide.key.trim()) keys.add(guide.key.trim());
  }
  for (const key of extraKeys ?? []) {
    const trimmed = key.trim();
    if (trimmed) keys.add(trimmed);
  }
  return [...keys].sort(guideKeySort);
}

function emptyGuideTemplate(key: string): InterviewGuideConfig {
  return {
    key,
    title: key,
    briefing: "",
    recommendedPanel: "",
    duration: "",
    stageDurations: { stage1: "", stage2: "", stage3: "" },
    screening: [],
    questions: [],
    scenarios: [],
    weights: [],
    interpretation: "",
    disqualifiers: [],
    disqualifierItems: [],
    ratingLabels: { ...RATING_LABELS },
  };
}

function applyOverride(
  base: InterviewGuideConfig,
  override: InterviewGuideOverride,
): InterviewGuideConfig {
  const merged: InterviewGuideConfig = {
    ...base,
    key: override.key,
    title: override.title ?? base.title,
    grade: override.grade ?? base.grade,
    briefing: override.briefing ?? base.briefing,
    recommendedPanel: override.recommendedPanel ?? base.recommendedPanel,
    duration: override.duration ?? base.duration,
    stageDurations: {
      stage1: override.stageDurations?.stage1 ?? base.stageDurations.stage1,
      stage2: override.stageDurations?.stage2 ?? base.stageDurations.stage2,
      stage3: override.stageDurations?.stage3 ?? base.stageDurations.stage3,
    },
    screening: override.screening ?? base.screening,
    questions: override.questions ?? base.questions,
    scenarios: override.scenarios ?? base.scenarios,
    weights: override.weights ?? base.weights,
    ratingLabels: {
      ...base.ratingLabels,
      ...override.ratingLabels,
    },
  };

  if (override.disqualifiers?.length) {
    merged.disqualifierItems = override.disqualifiers;
    merged.disqualifiers = override.disqualifiers.map((d) => d.label);
  } else if (base.disqualifierItems?.length) {
    merged.disqualifierItems = base.disqualifierItems;
    merged.disqualifiers = base.disqualifierItems.map((d) => d.label);
  }

  return merged;
}

export function resolveInterviewGuideFromConfig(
  guideKey: string,
  config?: InterviewGuidesConfig,
): InterviewGuideConfig | null {
  const key = guideKey.trim();
  if (!key) return null;

  const override = config?.guides?.find((g) => g.key === key);
  const gitGuide = getGitInterviewGuide(key as InterviewGuideKey);

  if (override?.dbOnly) {
    return applyOverride(emptyGuideTemplate(key), override);
  }

  if (gitGuide) {
    return override ? applyOverride({ ...gitGuide, ratingLabels: { ...RATING_LABELS } }, override) : {
      ...gitGuide,
      ratingLabels: { ...RATING_LABELS },
      disqualifierItems: gitGuide.disqualifiers.map((label, i) => ({
        id: `dq_${i}`,
        label,
      })),
    };
  }

  if (override) {
    return applyOverride(emptyGuideTemplate(key), override);
  }

  return null;
}

export function buildGuideOverrideFromResolved(
  guide: InterviewGuideConfig,
): InterviewGuideOverride {
  return {
    key: guide.key,
    title: guide.title,
    grade: guide.grade,
    briefing: guide.briefing,
    recommendedPanel: guide.recommendedPanel,
    duration: guide.duration,
    stageDurations: { ...guide.stageDurations },
    screening: (guide.screening ?? []).map((s) => ({ ...s })),
    questions: (guide.questions ?? []).map((q) => ({ ...q })),
    scenarios: (guide.scenarios ?? []).map((s) => ({ ...s })),
    weights: (guide.weights ?? []).map((w) => ({
      ...w,
      questionIds: [...w.questionIds],
    })),
    disqualifiers:
      guide.disqualifierItems?.map((d) => ({ ...d })) ??
      (guide.disqualifiers ?? []).map((label, i) => ({
        id: `dq_${i}`,
        label,
      })),
    ratingLabels: guide.ratingLabels ? { ...guide.ratingLabels } : { ...RATING_LABELS },
  };
}
