"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { ModuleBusinessLogic } from "@/lib/systemDefinitions";
import {
  GIT_INTERVIEW_GUIDE_KEYS,
  RATING_LABELS,
  type InterviewGuideConfig,
} from "@/lib/careers/interviewFormConfigs";
import {
  buildGuideOverrideFromResolved,
  listInterviewGuideKeys,
  resolveInterviewGuideFromConfig,
  type ExtraInterviewStageDef,
  type InterviewGuideOverride,
  type InterviewGuidesConfig,
} from "@/lib/systemDefinitions/interviewGuidesConfig";
import {
  DEFAULT_INTERVIEW_EVALUATION_LABELS,
  resolveInterviewEvaluationLabels,
  type InterviewEvaluationConfig,
} from "@/lib/systemDefinitions/interviewEvaluationConfig";
import { resolveInterviewGuideKeys } from "@/lib/systemDefinitions/gradeLevelsConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

type TabId =
  | "overview"
  | "screening"
  | "questions"
  | "scenarios"
  | "evaluation"
  | "ratings"
  | "extra_stages";

const TAB_LABELS: Record<TabId, string> = {
  overview: "Overview",
  screening: "Stage 1 — Screening",
  questions: "Stage 1 — Questions",
  scenarios: "Stage 2 — Practical",
  evaluation: "Evaluation checklist",
  ratings: "Rating scale",
  extra_stages: "Extra stages",
};

async function fetchModuleConfigApi(moduleId: string) {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
  );
  return res.data.data as { businessLogic: ModuleBusinessLogic };
}

type Props = {
  moduleId: string;
  readOnly?: boolean;
  canAdd?: boolean;
  canEdit?: boolean;
};

function normalizeGuideDraft(draft: InterviewGuideOverride): InterviewGuideOverride {
  return {
    ...draft,
    screening: draft.screening ?? [],
    questions: draft.questions ?? [],
    scenarios: draft.scenarios ?? [],
    weights: draft.weights ?? [],
    disqualifiers: draft.disqualifiers ?? [],
  };
}

function draftForKey(
  key: string,
  savedGuides: InterviewGuideOverride[],
): InterviewGuideOverride {
  const fromSaved = savedGuides.find((g) => g.key === key);
  if (fromSaved) return normalizeGuideDraft(fromSaved);

  const resolved = resolveInterviewGuideFromConfig(key, { guides: savedGuides });
  if (resolved) {
    return normalizeGuideDraft(buildGuideOverrideFromResolved(resolved));
  }
  return emptyGuide(key);
}

function emptyGuide(key: string): InterviewGuideOverride {
  return {
    key,
    title: key,
    dbOnly: !GIT_INTERVIEW_GUIDE_KEYS.includes(key as (typeof GIT_INTERVIEW_GUIDE_KEYS)[number]),
    screening: [],
    questions: [],
    scenarios: [],
    weights: [],
    disqualifiers: [],
    ratingLabels: { ...RATING_LABELS },
    stageDurations: { stage1: "", stage2: "", stage3: "" },
    briefing: "",
    recommendedPanel: "",
    duration: "",
  };
}

export default function InterviewGuidesEditor({
  moduleId,
  readOnly = false,
  canAdd = true,
  canEdit = true,
}: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];
  const [selectedKey, setSelectedKey] = useState<string>("L1");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [guideDraft, setGuideDraft] = useState<InterviewGuideOverride | null>(null);
  const [evaluationDraft, setEvaluationDraft] = useState<InterviewEvaluationConfig>({});
  const [extraStagesDraft, setExtraStagesDraft] = useState<ExtraInterviewStageDef[]>([]);
  const [savedGuides, setSavedGuides] = useState<InterviewGuideOverride[]>([]);
  const [showNewGuide, setShowNewGuide] = useState(false);
  const [newGuideKey, setNewGuideKey] = useState("");
  const [cloneFromKey, setCloneFromKey] = useState("");
  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;
  const savedGuidesRef = useRef(savedGuides);
  savedGuidesRef.current = savedGuides;
  const prevSelectedKeyRef = useRef(selectedKey);

  const { data: businessLogic, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
    select: (data) => data.businessLogic,
    enabled: moduleId === RECRUITMENT_MODULE_ID,
  });

  const guidesConfig = businessLogic?.interviewGuidesConfig;
  const gradeLevelIds = useMemo(
    () => resolveInterviewGuideKeys(businessLogic?.gradeLevelsConfig),
    [businessLogic?.gradeLevelsConfig],
  );

  const guideKeys = useMemo(() => {
    const keys = listInterviewGuideKeys(
      guidesConfig,
      gradeLevelIds,
      savedGuides.map((g) => g.key),
    );
    if (selectedKey && !keys.includes(selectedKey)) {
      return [...keys, selectedKey].sort((a, b) => {
        const aMatch = /^L(\d+)$/.exec(a);
        const bMatch = /^L(\d+)$/.exec(b);
        if (aMatch && bMatch) return Number(aMatch[1]) - Number(bMatch[1]);
        if (aMatch) return -1;
        if (bMatch) return 1;
        return a.localeCompare(b);
      });
    }
    return keys;
  }, [guidesConfig, gradeLevelIds, savedGuides, selectedKey]);

  const patchGuideDraft = useCallback(
    (patch: Partial<InterviewGuideOverride>) => {
      setGuideDraft((prev) => (prev ? normalizeGuideDraft({ ...prev, ...patch }) : prev));
    },
    [],
  );

  useEffect(() => {
    const saved = guidesConfig?.guides ?? [];
    const normalized = saved.map((g) => ({ ...g }));
    setSavedGuides(normalized);
    setExtraStagesDraft(
      guidesConfig?.extraStages?.map((s) => ({ ...s })) ?? [],
    );
    setGuideDraft(draftForKey(selectedKeyRef.current, normalized));
  }, [guidesConfig]);

  useEffect(() => {
    const evalCfg = businessLogic?.interviewEvaluationConfig;
    const labels = resolveInterviewEvaluationLabels(evalCfg);
    setEvaluationDraft({
      observedLabel: labels.observed,
      notObservedLabel: labels.notObserved,
      neutralLabel: labels.neutral,
    });
  }, [businessLogic?.interviewEvaluationConfig]);

  useEffect(() => {
    if (!selectedKey || prevSelectedKeyRef.current === selectedKey) return;
    prevSelectedKeyRef.current = selectedKey;
    setGuideDraft(draftForKey(selectedKey, savedGuidesRef.current));
  }, [selectedKey]);

  const allowEdit = !readOnly && canEdit;
  const allowAdd = !readOnly && (canAdd || canEdit);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      interviewGuidesConfig: InterviewGuidesConfig;
      interviewEvaluationConfig: InterviewEvaluationConfig;
    }) => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
      );
      const current = res.data.data.businessLogic as ModuleBusinessLogic;
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            interviewGuidesConfig: payload.interviewGuidesConfig,
            interviewEvaluationConfig: payload.interviewEvaluationConfig,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Interview guide settings saved.");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save interview guide.");
    },
  });

  const handleSave = () => {
    if (!guideDraft) return;

    const cleanedGuide: InterviewGuideOverride = {
      ...guideDraft,
      key: guideDraft.key.trim(),
      title: guideDraft.title?.trim() || guideDraft.key.trim(),
      screening: guideDraft.screening?.filter((s) => s.requirement.trim()) ?? [],
      questions: guideDraft.questions?.filter((q) => q.question.trim()) ?? [],
      scenarios: guideDraft.scenarios?.filter((s) => s.title.trim()) ?? [],
      disqualifiers: guideDraft.disqualifiers?.filter((d) => d.label.trim()) ?? [],
    };

    if (!cleanedGuide.key) {
      toast.error("Select or create an interview guide key.");
      return;
    }

    const nextGuides = [
      ...savedGuides.filter((g) => g.key !== cleanedGuide.key),
      cleanedGuide,
    ];

    saveMutation.mutate({
      interviewGuidesConfig: {
        guides: nextGuides,
        extraStages: extraStagesDraft.filter((s) => s.label.trim()),
      },
      interviewEvaluationConfig: {
        observedLabel: evaluationDraft.observedLabel?.trim(),
        notObservedLabel: evaluationDraft.notObservedLabel?.trim(),
        neutralLabel: evaluationDraft.neutralLabel?.trim(),
      },
    });
  };

  const handleCreateGuide = () => {
    const key = newGuideKey.trim().replace(/\s+/g, "_");
    if (!key) {
      toast.error("Enter a guide key (e.g. L8 or senior_analyst).");
      return;
    }
    if (guideKeys.includes(key)) {
      toast.error("That guide key already exists.");
      return;
    }

    let draft = emptyGuide(key);
    if (cloneFromKey) {
      const source = resolveInterviewGuideFromConfig(cloneFromKey, {
        guides: savedGuides,
      });
      if (source) {
        draft = {
          ...buildGuideOverrideFromResolved(source),
          key,
          title: `${source.title} (${key})`,
          dbOnly: !GIT_INTERVIEW_GUIDE_KEYS.includes(
            key as (typeof GIT_INTERVIEW_GUIDE_KEYS)[number],
          ),
        };
      }
    }

    setSavedGuides((prev) => [...prev, draft]);
    setSelectedKey(key);
    setShowNewGuide(false);
    setNewGuideKey("");
    setCloneFromKey("");
    setGuideDraft(draft);
    toast.success(`Guide "${key}" ready to edit — save when done.`);
  };

  if (isLoading || !guideDraft) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const previewGuide: InterviewGuideConfig | null = resolveInterviewGuideFromConfig(
    selectedKey,
    { guides: [guideDraft, ...savedGuides.filter((g) => g.key !== guideDraft.key)] },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Interview guide (grade / role key)
          </label>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            disabled={!allowEdit}
          >
            {guideKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Link job postings to a guide key under Job posting or Grade levels.
            L1 = Junior Swine Technician, etc.
          </p>
        </div>
        {allowAdd && (
          <button
            type="button"
            onClick={() => setShowNewGuide((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
          >
            <Plus className="w-4 h-4" />
            New guide
          </button>
        )}
      </div>

      {showNewGuide && allowAdd && (
        <div className="rounded-lg border border-dashed border-gray-300 p-4 space-y-3 bg-gray-50">
          <p className="text-sm font-medium text-gray-800">Create interview for a new grade level</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              value={newGuideKey}
              onChange={(e) => setNewGuideKey(e.target.value)}
              placeholder="Guide key (e.g. L8)"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={cloneFromKey}
              onChange={(e) => setCloneFromKey(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Start blank</option>
              {guideKeys.map((key) => (
                <option key={key} value={key}>
                  Clone from {key}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleCreateGuide}
            className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg"
          >
            Add guide
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-gray-100 pb-2">
        {(Object.keys(TAB_LABELS) as TabId[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              activeTab === tab
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-3">
          <input
            value={guideDraft.title ?? ""}
            onChange={(e) => patchGuideDraft({ title: e.target.value })}
            placeholder="Guide title"
            readOnly={!allowEdit}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={guideDraft.grade ?? ""}
            onChange={(e) => patchGuideDraft({ grade: e.target.value })}
            placeholder="Grade label (e.g. L1)"
            readOnly={!allowEdit}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={guideDraft.briefing ?? ""}
            onChange={(e) => patchGuideDraft({ briefing: e.target.value })}
            placeholder="Panel briefing"
            readOnly={!allowEdit}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={guideDraft.recommendedPanel ?? ""}
            onChange={(e) => patchGuideDraft({ recommendedPanel: e.target.value })}
            placeholder="Recommended panel"
            readOnly={!allowEdit}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={guideDraft.duration ?? ""}
            onChange={(e) => patchGuideDraft({ duration: e.target.value })}
            placeholder="Total duration"
            readOnly={!allowEdit}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
          <div className="grid sm:grid-cols-3 gap-2">
            {(["stage1", "stage2", "stage3"] as const).map((stage) => (
              <input
                key={stage}
                value={guideDraft.stageDurations?.[stage] ?? ""}
                onChange={(e) =>
                  patchGuideDraft({
                    stageDurations: {
                      ...guideDraft.stageDurations,
                      [stage]: e.target.value,
                    },
                  })
                }
                placeholder={`${stage} duration`}
                readOnly={!allowEdit}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            ))}
          </div>
          {previewGuide && (
            <p className="text-xs text-gray-500">
              Preview: {previewGuide.questions.length} questions,{" "}
              {previewGuide.scenarios.length} practical items,{" "}
              {previewGuide.disqualifiers.length} evaluation lines.
            </p>
          )}
        </div>
      )}

      {activeTab === "screening" && (
        <ListEditor
          title="Section A — mandatory screening"
          allowEdit={allowEdit}
          items={guideDraft.screening ?? []}
          onChange={(screening) => patchGuideDraft({ screening })}
          renderRow={(item, onPatch, onRemove) => (
            <div className="flex gap-2 items-start">
              <input
                value={item.id}
                onChange={(e) => onPatch({ id: e.target.value })}
                className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
                readOnly={!allowEdit}
              />
              <textarea
                value={item.requirement}
                onChange={(e) => onPatch({ requirement: e.target.value })}
                rows={2}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                readOnly={!allowEdit}
              />
              <label className="text-xs flex items-center gap-1 shrink-0 pt-1">
                <input
                  type="checkbox"
                  checked={item.mandatory === true}
                  onChange={(e) => onPatch({ mandatory: e.target.checked })}
                  disabled={!allowEdit}
                />
                Mandatory
              </label>
              {allowEdit && (
                <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          onAdd={() => ({
            id: `A${(guideDraft.screening?.length ?? 0) + 1}`,
            requirement: "",
            mandatory: false,
          })}
        />
      )}

      {activeTab === "questions" && (
        <ListEditor
          title="Stage 1 — structured questions"
          allowEdit={allowEdit}
          items={guideDraft.questions ?? []}
          onChange={(questions) => patchGuideDraft({ questions })}
          renderRow={(item, onPatch, onRemove) => (
            <div className="space-y-2 border border-gray-100 rounded-lg p-3">
              <div className="flex gap-2">
                <input
                  value={item.id}
                  onChange={(e) => onPatch({ id: e.target.value })}
                  className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
                  readOnly={!allowEdit}
                />
                <input
                  value={item.section}
                  onChange={(e) => onPatch({ section: e.target.value })}
                  placeholder="Section"
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                  readOnly={!allowEdit}
                />
                {allowEdit && (
                  <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <textarea
                value={item.question}
                onChange={(e) => onPatch({ question: e.target.value })}
                placeholder="Question"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                readOnly={!allowEdit}
              />
              <textarea
                value={item.lookFor}
                onChange={(e) => onPatch({ lookFor: e.target.value })}
                placeholder="Look for"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                readOnly={!allowEdit}
              />
            </div>
          )}
          onAdd={() => ({
            id: `Q${(guideDraft.questions?.length ?? 0) + 1}`,
            section: "",
            question: "",
            lookFor: "",
          })}
        />
      )}

      {activeTab === "scenarios" && (
        <ListEditor
          title="Stage 2 — practical / scenarios"
          allowEdit={allowEdit}
          items={guideDraft.scenarios ?? []}
          onChange={(scenarios) => patchGuideDraft({ scenarios })}
          renderRow={(item, onPatch, onRemove) => (
            <div className="space-y-2 border border-gray-100 rounded-lg p-3">
              <div className="flex gap-2">
                <input
                  value={item.id}
                  onChange={(e) => onPatch({ id: e.target.value })}
                  className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
                  readOnly={!allowEdit}
                />
                <input
                  value={item.section}
                  onChange={(e) => onPatch({ section: e.target.value })}
                  placeholder="Section"
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                  readOnly={!allowEdit}
                />
                {allowEdit && (
                  <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <input
                value={item.title}
                onChange={(e) => onPatch({ title: e.target.value })}
                placeholder="Practical title"
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                readOnly={!allowEdit}
              />
              <textarea
                value={item.observe}
                onChange={(e) => onPatch({ observe: e.target.value })}
                placeholder="What to observe"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm"
                readOnly={!allowEdit}
              />
            </div>
          )}
          onAdd={() => ({
            id: `P${(guideDraft.scenarios?.length ?? 0) + 1}`,
            section: "Section C",
            title: "",
            observe: "",
          })}
        />
      )}

      {activeTab === "evaluation" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-800">Observed / Not observed labels</p>
            <div className="grid sm:grid-cols-3 gap-2">
              <input
                value={evaluationDraft.observedLabel ?? DEFAULT_INTERVIEW_EVALUATION_LABELS.observed}
                onChange={(e) =>
                  setEvaluationDraft({ ...evaluationDraft, observedLabel: e.target.value })
                }
                placeholder="Observed"
                readOnly={!allowEdit}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={
                  evaluationDraft.notObservedLabel ??
                  DEFAULT_INTERVIEW_EVALUATION_LABELS.notObserved
                }
                onChange={(e) =>
                  setEvaluationDraft({ ...evaluationDraft, notObservedLabel: e.target.value })
                }
                placeholder="Not observed"
                readOnly={!allowEdit}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={evaluationDraft.neutralLabel ?? DEFAULT_INTERVIEW_EVALUATION_LABELS.neutral}
                onChange={(e) =>
                  setEvaluationDraft({ ...evaluationDraft, neutralLabel: e.target.value })
                }
                placeholder="Neutral"
                readOnly={!allowEdit}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <ListEditor
            title="Critical concerns checklist (Stage 3 evaluation)"
            allowEdit={allowEdit}
            items={guideDraft.disqualifiers ?? []}
            onChange={(disqualifiers) => patchGuideDraft({ disqualifiers })}
            renderRow={(item, onPatch, onRemove) => (
              <div className="flex gap-2 items-center">
                <input
                  value={item.id}
                  onChange={(e) => onPatch({ id: e.target.value })}
                  className="w-24 border border-gray-200 rounded px-2 py-1 text-xs"
                  readOnly={!allowEdit}
                />
                <input
                  value={item.label}
                  onChange={(e) => onPatch({ label: e.target.value })}
                  placeholder="Concern to watch for"
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                  readOnly={!allowEdit}
                />
                {allowEdit && (
                  <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
            onAdd={() => ({
              id: `dq_${(guideDraft.disqualifiers?.length ?? 0) + 1}`,
              label: "",
            })}
          />
        </div>
      )}

      {activeTab === "ratings" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">1–5 rating scale labels used on Stage 1 and Stage 2.</p>
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <span className="w-6 text-sm font-medium text-gray-500">{n}</span>
              <input
                value={guideDraft.ratingLabels?.[n] ?? RATING_LABELS[n]}
                onChange={(e) =>
                  patchGuideDraft({
                    ratingLabels: {
                      ...guideDraft.ratingLabels,
                      [n]: e.target.value,
                    },
                  })
                }
                readOnly={!allowEdit}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {activeTab === "extra_stages" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Define additional interview stages here. These are saved in System Definitions only —
            the recruitment interview wizard still uses Stages 1–3 until wired later.
          </p>
          <ListEditor
            title="Extra stages"
            allowEdit={allowEdit}
            items={extraStagesDraft}
            onChange={setExtraStagesDraft}
            renderRow={(item, onPatch, onRemove) => (
              <div className="flex flex-wrap gap-2 items-center border border-gray-100 rounded-lg p-3">
                <input
                  value={item.id}
                  onChange={(e) => onPatch({ id: e.target.value })}
                  className="w-24 border border-gray-200 rounded px-2 py-1 text-xs"
                  readOnly={!allowEdit}
                />
                <input
                  value={item.label}
                  onChange={(e) => onPatch({ label: e.target.value })}
                  placeholder="Stage label"
                  className="flex-1 min-w-[140px] border border-gray-200 rounded px-2 py-1 text-sm"
                  readOnly={!allowEdit}
                />
                <input
                  value={item.duration ?? ""}
                  onChange={(e) => onPatch({ duration: e.target.value })}
                  placeholder="Duration"
                  className="w-32 border border-gray-200 rounded px-2 py-1 text-sm"
                  readOnly={!allowEdit}
                />
                <label className="text-xs flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.hasPanelSetup === true}
                    onChange={(e) => onPatch({ hasPanelSetup: e.target.checked })}
                    disabled={!allowEdit}
                  />
                  Panel setup
                </label>
                <label className="text-xs flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.hasReviewStep === true}
                    onChange={(e) => onPatch({ hasReviewStep: e.target.checked })}
                    disabled={!allowEdit}
                  />
                  Review step
                </label>
                {allowEdit && (
                  <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
            onAdd={() => ({
              id: `stage_${extraStagesDraft.length + 4}`,
              label: `Stage ${extraStagesDraft.length + 4}`,
              hasPanelSetup: true,
              hasReviewStep: true,
            })}
          />
          <p className="text-xs text-gray-400 italic">
            Word/PDF upload to generate questions from a document will be added in a follow-up —
            guides can be built manually here for now.
          </p>
        </div>
      )}

      {allowEdit && (
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg disabled:opacity-60"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save interview guide
          </button>
        </div>
      )}
    </div>
  );
}

function ListEditor<T extends { id: string }>({
  title,
  items,
  onChange,
  renderRow,
  onAdd,
  allowEdit,
}: {
  title: string;
  items: T[] | undefined;
  onChange: (items: T[]) => void;
  renderRow: (
    item: T,
    onPatch: (patch: Partial<T>) => void,
    onRemove: () => void,
  ) => React.ReactNode;
  onAdd: () => T;
  allowEdit: boolean;
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        {allowEdit && (
          <button
            type="button"
            onClick={() => onChange([...safeItems, onAdd()])}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-700"
          >
            <Plus className="w-3.5 h-3.5" />
            Add row
          </button>
        )}
      </div>
      <div className="space-y-2">
        {safeItems.length === 0 && (
          <p className="text-sm text-gray-400 italic text-center py-4">No rows yet.</p>
        )}
        {safeItems.map((item, index) => (
          <Fragment key={item.id || `row-${index}`}>
            {renderRow(
              item,
              (patch) => {
                const next = [...safeItems];
                next[index] = { ...item, ...patch };
                onChange(next);
              },
              () => onChange(safeItems.filter((_, i) => i !== index)),
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
