"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import { ACCEPT_JD } from "@/lib/uploadConstraints";
import { RATING_LABELS } from "@/lib/careers/interviewFormConfigs";
import {
  normalizePostingInterviewSetup,
  type PostingInterviewSetupContent,
} from "@/lib/careers/postingInterviewSetup";
import { DEFAULT_INTERVIEW_EVALUATION_LABELS } from "@/lib/systemDefinitions/interviewEvaluationConfig";
import {
  INTERVIEW_BENCHMARK_FIELD_DEFS,
  formatInterviewBenchmarksForPrompt,
  validateInterviewBenchmarks,
} from "@/lib/systemDefinitions/interviewBenchmarksConfig";
import { ListEditor } from "./InterviewListEditor";

// 5-minute increments, 30-60 minutes.
const DURATION_OPTIONS = [30, 35, 40, 45, 50, 55, 60];

type TabId =
  | "overview"
  | "screening"
  | "questions"
  | "scenarios"
  | "evaluation"
  | "ratings"
  | "benchmarks"
  | "extra_stages";

// Same tab set as Interview under Recruitment (InterviewGuidesEditor) —
// only the Overview tab's content differs, since this is per-posting
// rather than per grade level.
const TAB_LABELS: Record<TabId, string> = {
  overview: "Overview",
  screening: "Stage 1 — Screening",
  questions: "Stage 1 — Questions",
  scenarios: "Stage 2 — Practical",
  evaluation: "Evaluation checklist",
  ratings: "Rating scale",
  benchmarks: "Score benchmarks",
  extra_stages: "Extra stages",
};

export type PostingOverviewRow = { label: string; value: string };

/** Everything "Reuse interview setup" copies in from another posting — the full Interview setup screen (Overview's Description/Recommended panel members/Approximate duration plus every other tab). */
export type PostingInterviewReusePayload = {
  description: string;
  panelMembers: string;
  durationMinutes: number | null;
  setup: PostingInterviewSetupContent;
};

export type PostingInterviewSetupHandle = {
  applyReuse: (payload: PostingInterviewReusePayload) => void;
};

type Props = {
  postingId: string;
  /** Read-only summary of this posting's own org-structure fields — Position, Sites, Business units, Departments/divisions, Sections, Grade levels, Employment Type (Salary, Salary Band, and Age are deliberately left out). */
  overview: PostingOverviewRow[];
  initialDescription?: string | null;
  initialPanelMembers?: string | null;
  initialDurationMinutes?: number | null;
  initialInterviewSetup?: unknown;
  readOnly?: boolean;
  /** Called after a successful save — the caller returns to the postings table. */
  onDone: () => void;
};

function PostingInterviewSetup(
  {
    postingId,
    overview,
    initialDescription,
    initialPanelMembers,
    initialDurationMinutes,
    initialInterviewSetup,
    readOnly = false,
    onDone,
  }: Props,
  ref: React.ForwardedRef<PostingInterviewSetupHandle>,
) {
  const allowEdit = !readOnly;

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [panelMembers, setPanelMembers] = useState(initialPanelMembers ?? "");
  const [durationMinutes, setDurationMinutes] = useState<number | "">(
    initialDurationMinutes ?? "",
  );
  const [setup, setSetup] = useState<PostingInterviewSetupContent>(() =>
    normalizePostingInterviewSetup(initialInterviewSetup),
  );

  // "Reuse interview setup" (in the parent page, next to the Active/Archive
  // tabs) picks another posting and calls this to replace everything here —
  // Overview included — with that posting's content. Editing/deleting/
  // adding rows afterwards works exactly as normal.
  useImperativeHandle(ref, () => ({
    applyReuse: (payload) => {
      setDescription(payload.description);
      setPanelMembers(payload.panelMembers);
      setDurationMinutes(payload.durationMinutes ?? "");
      setSetup(payload.setup);
      setActiveTab("overview");
    },
  }));

  const patchSetup = (patch: Partial<PostingInterviewSetupContent>) =>
    setSetup((prev) => ({ ...prev, ...patch }));

  // "Autofill with AI" — upload an existing interview guide document (Word
  // or PDF) and have Claude read it straight into every tab here, the same
  // way the CV screening and JD auto-fill features read a document. Local
  // state only, same as any other edit — nothing is saved until the usual
  // Save button is clicked.
  const [autofilling, setAutofilling] = useState(false);
  const handleAutofillFile = async (file: File) => {
    setAutofilling(true);
    try {
      const uploaded = await uploadCareersFile(file, "CareersInterviewGuide", ACCEPT_JD);
      const res = await api.post("/careers/interview-setup/extract", {
        file_url: uploaded.secure_url,
        file_name: uploaded.original_name,
      });
      const extracted = res.data.data as {
        description: string;
        panelMembers: string;
        durationMinutes: number | null;
        setup: unknown;
      };
      if (extracted.description) setDescription(extracted.description);
      if (extracted.panelMembers) setPanelMembers(extracted.panelMembers);
      if (extracted.durationMinutes != null) setDurationMinutes(extracted.durationMinutes);
      setSetup(normalizePostingInterviewSetup(extracted.setup));
      toast.success("Interview setup filled in from the document — review before saving.");
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err instanceof Error ? err.message : undefined);
      toast.error(message ?? "Couldn't read that document.");
    } finally {
      setAutofilling(false);
    }
  };

  const tabOrder = Object.keys(TAB_LABELS) as TabId[];
  const currentTabIndex = tabOrder.indexOf(activeTab);
  const isLastTab = currentTabIndex === tabOrder.length - 1;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const benchmarkError = validateInterviewBenchmarks(setup.benchmarks);
      if (benchmarkError) throw new Error(benchmarkError);

      return api.patch(`/careers/postings/${postingId}`, {
        interview_description: description.trim(),
        interview_panel_members: panelMembers.trim(),
        interview_duration_minutes: durationMinutes === "" ? null : durationMinutes,
        interview_setup: {
          screening: setup.screening.filter((s) => s.requirement.trim()),
          questions: setup.questions.filter((q) => q.question.trim()),
          scenarios: setup.scenarios.filter((s) => s.title.trim()),
          disqualifiers: setup.disqualifiers.filter((d) => d.label.trim()),
          ratingLabels: setup.ratingLabels,
          evaluationLabels: setup.evaluationLabels,
          benchmarks: setup.benchmarks,
          extraStages: setup.extraStages.filter((s) => s.label.trim()),
        },
      });
    },
    onSuccess: () => {
      toast.success("Interview setup saved.");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message ?? "Could not save interview setup.");
    },
  });

  // Each tab's own save button persists the full setup, then either moves
  // on to the next tab or — on the last tab — returns to the postings
  // table, so HR never has to jump back up to a single save button after
  // filling in a page further down. Real interviews now read Description,
  // Recommended panel members, and Approximate duration straight off this
  // posting (see fetchPostingInterviewContext.ts), so all three must be
  // filled in before leaving Interview setup — checked here, at the point
  // of actually finishing, rather than on every intermediate tab.
  const handleTabSave = () => {
    if (isLastTab && (!description.trim() || !panelMembers.trim() || durationMinutes === "")) {
      toast.error(
        "Fill in Description, Recommended panel members, and Approximate duration on the Overview tab before finishing.",
      );
      setActiveTab("overview");
      return;
    }

    saveMutation.mutate(undefined, {
      onSuccess: () => {
        if (isLastTab) {
          onDone();
        } else {
          setActiveTab(tabOrder[currentTabIndex + 1]);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
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
        <div className="space-y-4">
          {overview.length > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Overview
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-gray-600">
                {overview.map((row) => (
                  <p key={row.label}>
                    {row.label}: <span className="font-medium text-gray-800">{row.value}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {allowEdit && (
            <div className="rounded-lg border border-dashed border-gray-300 p-3">
              <label className="flex flex-wrap items-center gap-2 cursor-pointer">
                {autofilling ? (
                  <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                ) : (
                  <Sparkles className="w-4 h-4 text-red-600" />
                )}
                <span className="text-sm font-medium text-red-700">
                  {autofilling ? "Reading document…" : "Autofill with AI"}
                </span>
                <span className="text-xs text-gray-400">
                  — upload an existing interview guide document (Word or PDF)
                </span>
                <input
                  type="file"
                  className="sr-only"
                  accept={ACCEPT_JD}
                  disabled={autofilling}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    await handleAutofillFile(file);
                  }}
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Description *</span>
            <textarea
              className="w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 mt-1 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:text-gray-500"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!allowEdit}
              placeholder="Describe what this interview will cover…"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Recommended panel members *</span>
            <textarea
              className="w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 mt-1 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:text-gray-500"
              rows={2}
              value={panelMembers}
              onChange={(e) => setPanelMembers(e.target.value)}
              disabled={!allowEdit}
              placeholder="e.g. Herd Supervisor (chair), Breeding Farm Manager, Veterinarian"
            />
          </label>

          <label className="block max-w-xs">
            <span className="text-xs font-medium text-gray-600">Approximate duration *</span>
            <select
              className="w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 mt-1 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:text-gray-500"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : "")}
              disabled={!allowEdit}
            >
              <option value="">Select duration…</option>
              {DURATION_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {activeTab === "screening" && (
        <ListEditor
          title="Section A — mandatory screening"
          allowEdit={allowEdit}
          items={setup.screening}
          onChange={(screening) => patchSetup({ screening })}
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
            id: `A${setup.screening.length + 1}`,
            requirement: "",
            mandatory: false,
          })}
        />
      )}

      {activeTab === "questions" && (
        <ListEditor
          title="Stage 1 — structured questions"
          allowEdit={allowEdit}
          items={setup.questions}
          onChange={(questions) => patchSetup({ questions })}
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
            id: `Q${setup.questions.length + 1}`,
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
          items={setup.scenarios}
          onChange={(scenarios) => patchSetup({ scenarios })}
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
            id: `P${setup.scenarios.length + 1}`,
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
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                value={
                  setup.evaluationLabels.observedLabel ??
                  DEFAULT_INTERVIEW_EVALUATION_LABELS.observed
                }
                onChange={(e) =>
                  patchSetup({
                    evaluationLabels: { ...setup.evaluationLabels, observedLabel: e.target.value },
                  })
                }
                placeholder="Observed"
                readOnly={!allowEdit}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={
                  setup.evaluationLabels.notObservedLabel ??
                  DEFAULT_INTERVIEW_EVALUATION_LABELS.notObserved
                }
                onChange={(e) =>
                  patchSetup({
                    evaluationLabels: {
                      ...setup.evaluationLabels,
                      notObservedLabel: e.target.value,
                    },
                  })
                }
                placeholder="Not observed"
                readOnly={!allowEdit}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <ListEditor
            title="Critical concerns checklist (Stage 3 evaluation)"
            allowEdit={allowEdit}
            items={setup.disqualifiers}
            onChange={(disqualifiers) => patchSetup({ disqualifiers })}
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
              id: `dq_${setup.disqualifiers.length + 1}`,
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
                value={setup.ratingLabels[n] ?? RATING_LABELS[n]}
                onChange={(e) =>
                  patchSetup({
                    ratingLabels: { ...setup.ratingLabels, [n]: e.target.value },
                  })
                }
                readOnly={!allowEdit}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {activeTab === "benchmarks" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Weighted interview scores use a 1–5 scale. These thresholds apply
            to this posting's own interview and are fed to AI stage
            analysis, final recommendations, and hire validation.
          </p>

          <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 font-semibold text-gray-600">Benchmark</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 w-28">Minimum (/5)</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Business meaning</th>
                </tr>
              </thead>
              <tbody>
                {INTERVIEW_BENCHMARK_FIELD_DEFS.map((field) => (
                  <tr key={field.key} className="border-b border-gray-100 align-top">
                    <td className="px-4 py-3 font-medium text-gray-900">{field.label}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        max={5}
                        step={0.1}
                        value={setup.benchmarks[field.key]}
                        onChange={(e) => {
                          const parsed = Number.parseFloat(e.target.value);
                          patchSetup({
                            benchmarks: {
                              ...setup.benchmarks,
                              [field.key]: Number.isFinite(parsed)
                                ? parsed
                                : setup.benchmarks[field.key],
                            },
                          });
                        }}
                        readOnly={!allowEdit}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{field.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              AI prompt preview
            </p>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {formatInterviewBenchmarksForPrompt(setup.benchmarks)}
            </pre>
          </div>
        </div>
      )}

      {activeTab === "extra_stages" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Define additional interview stages for this posting.
          </p>
          <ListEditor
            title="Extra stages"
            allowEdit={allowEdit}
            items={setup.extraStages}
            onChange={(extraStages) => patchSetup({ extraStages })}
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
              id: `stage_${setup.extraStages.length + 1}`,
              label: `Stage ${setup.extraStages.length + 1}`,
              hasPanelSetup: true,
              hasReviewStep: true,
            })}
          />
        </div>
      )}

      {allowEdit && (
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleTabSave}
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLastTab ? "Save and return to postings" : "Save and continue"}
          </button>
        </div>
      )}
    </div>
  );
}

export default forwardRef(PostingInterviewSetup);
