"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { InterviewGuideKey } from "@/lib/careers/openings";
import { getInterviewGuideKeyForRoleSlug } from "@/lib/careers/openings";
import {
  RECRUITMENT_JOB_POSTINGS_LIST,
  RECRUITMENT_MODULE_ID,
} from "@/lib/systemDefinitions/recruitmentDefaults";
import { useGradeLevelsConfig } from "@/hooks/useGradeLevelsConfig";
import { resolveInterviewGuideKeys } from "@/lib/systemDefinitions/gradeLevelsConfig";

const SPECIALIST_LABELS: Record<string, string> = {
  data_analyst: "Data Analyst",
  veterinarian: "Veterinarian",
};

type JobPostingRow = {
  id: string;
  label: string;
  legacy_value: string | null;
  sort_order: number;
  is_active: boolean;
  rules: { interviewGuideKey?: InterviewGuideKey };
};

type JobPostingsEditorProps = {
  moduleId: string;
  canAdd?: boolean;
  canEdit?: boolean;
};

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function resolveRowInterviewGuide(
  row: JobPostingRow,
): InterviewGuideKey {
  const fromRules = row.rules?.interviewGuideKey;
  if (fromRules) return fromRules;
  const legacy = getInterviewGuideKeyForRoleSlug(row.legacy_value ?? "");
  if (legacy) return legacy;
  return "L1";
}

export default function JobPostingsEditor({
  moduleId,
  canAdd = true,
  canEdit = true,
}: JobPostingsEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_options", moduleId, RECRUITMENT_JOB_POSTINGS_LIST];

  const { config: gradeConfig } = useGradeLevelsConfig();

  const guideOptions = useMemo(() => {
    const keys = resolveInterviewGuideKeys(gradeConfig);
    return keys.map((value) => ({
      value: value as InterviewGuideKey,
      label: SPECIALIST_LABELS[value] ?? value,
    }));
  }, [gradeConfig]);

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newGuide, setNewGuide] = useState<InterviewGuideKey>("L1");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editKey, setEditKey] = useState("");
  const [editGuide, setEditGuide] = useState<InterviewGuideKey>("L1");

  const { data: rows = [], isLoading } = useQuery<JobPostingRow[]>({
    queryKey,
    queryFn: async () => {
      const res = await api.get("/system-definitions/options", {
        params: {
          module_id: moduleId,
          option_list: RECRUITMENT_JOB_POSTINGS_LIST,
          include_inactive: true,
        },
      });
      return res.data.data as JobPostingRow[];
    },
    enabled: moduleId === RECRUITMENT_MODULE_ID,
  });

  const activeRows = useMemo(
    () => rows.filter((r) => r.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [rows],
  );
  const inactiveRows = useMemo(
    () => rows.filter((r) => !r.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [rows],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (payload: {
      module_id: string;
      option_list: string;
      label: string;
      legacy_value: string;
      rules: { interviewGuideKey: InterviewGuideKey };
    }) => api.post("/system-definitions/options", payload),
    onSuccess: (res) => {
      const reactivated = res?.data?.reactivated === true;
      toast.success(
        reactivated
          ? "Job posting role restored and updated."
          : "Job posting role added.",
      );
      setShowAdd(false);
      setNewLabel("");
      setNewKey("");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["careers_job_postings"] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(
        err?.response?.data?.error ??
          "Could not add job posting role. The internal key may already exist — try editing the existing row.",
      );
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Record<string, unknown>;
    }) => api.patch(`/system-definitions/options/${encodeURIComponent(id)}`, patch),
    onSuccess: () => {
      toast.success("Job posting role updated.");
      setEditingId(null);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["careers_job_postings"] });
    },
    onError: () => toast.error("Could not save job posting role."),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/system-definitions/options/${encodeURIComponent(id)}`, {
        is_active: false,
      }),
    onSuccess: () => {
      toast.success("Job posting role removed.");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["careers_job_postings"] });
    },
    onError: () => toast.error("Could not remove job posting role."),
  });

  if (moduleId !== RECRUITMENT_MODULE_ID) return null;

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm";

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Roles HR can select when publishing a career posting. Each role maps to an interview guide (not shown publicly).
        Salary bands (low / mid / high) are configured per grade under Grade levels.
        If a role already exists (e.g. Senior Swine Technician from setup), edit it below instead of adding again.
      </p>

      {canAdd && (
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <Plus className="w-3.5 h-3.5" />
          Add job posting role
        </button>
      )}

      {showAdd && canAdd && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="block sm:col-span-2">
              <span className="text-xs text-gray-500">Role title (shown on public careers page)</span>
              <input
                className={inputClass}
                value={newLabel}
                onChange={(e) => {
                  setNewLabel(e.target.value);
                  if (!newKey || newKey === slugifyKey(newLabel)) {
                    setNewKey(slugifyKey(e.target.value));
                  }
                }}
                placeholder="Junior Swine Technician"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Internal key</span>
              <input
                className={inputClass}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Interview guide</span>
              <select
                className={inputClass}
                value={newGuide}
                onChange={(e) => setNewGuide(e.target.value as InterviewGuideKey)}
              >
                {guideOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-200">
              <X className="w-4 h-4 text-gray-500" />
            </button>
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => {
                if (!newLabel.trim() || !newKey.trim()) {
                  toast.error("Title and key are required.");
                  return;
                }
                const key = newKey.trim();
                const existing = rows.find((r) => r.legacy_value === key);
                if (existing?.is_active) {
                  toast.error(
                    `"${existing.label}" already uses key "${key}". Edit it in the list below.`,
                  );
                  return;
                }
                if (existing && !existing.is_active) {
                  toast.message("Restoring removed role with your updates…");
                }
                createMutation.mutate({
                  module_id: moduleId,
                  option_list: RECRUITMENT_JOB_POSTINGS_LIST,
                  label: newLabel.trim(),
                  legacy_value: key,
                  rules: { interviewGuideKey: newGuide },
                });
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Save
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-4 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : activeRows.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-4 text-center">
          No active job posting roles. Add one above or restore a removed role below.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {activeRows.map((row) => {
              const isEditing = editingId === row.id;
              const guide = resolveRowInterviewGuide(row);

              return (
                <li key={row.id} className="px-3 py-3 bg-white">
                  {isEditing && canEdit ? (
                    <div className="space-y-2">
                      <div className="grid sm:grid-cols-2 gap-2">
                        <label className="block sm:col-span-2">
                          <span className="text-xs text-gray-500">Public title</span>
                          <input
                            className={inputClass}
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500">Internal key</span>
                          <input
                            className={inputClass}
                            value={editKey}
                            onChange={(e) => setEditKey(e.target.value)}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-500">Interview guide</span>
                          <select
                            className={inputClass}
                            value={editGuide}
                            onChange={(e) =>
                              setEditGuide(e.target.value as InterviewGuideKey)
                            }
                          >
                            {guideOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1.5 rounded-lg hover:bg-gray-200"
                        >
                          <X className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patchMutation.mutate({
                              id: row.id,
                              patch: {
                                label: editLabel.trim(),
                                legacy_value: editKey.trim(),
                                rules: { interviewGuideKey: editGuide },
                              },
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{row.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Key: {row.legacy_value} · Interview guide: {guide}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(row.id);
                              setEditLabel(row.label);
                              setEditKey(row.legacy_value ?? "");
                              setEditGuide(guide);
                            }}
                            className="p-1.5 rounded-lg hover:bg-gray-100"
                          >
                            <Pencil className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deactivateMutation.mutate(row.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      )}

      {inactiveRows.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-gray-500">Removed roles (can be restored)</p>
          <ul className="divide-y divide-gray-100 border border-dashed border-gray-200 rounded-xl overflow-hidden">
            {inactiveRows.map((row) => {
              const guide = resolveRowInterviewGuide(row);
              return (
                <li
                  key={row.id}
                  className="px-3 py-2.5 bg-gray-50 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm text-gray-600">{row.label}</p>
                    <p className="text-xs text-gray-400">
                      Key: {row.legacy_value} · Guide: {guide}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        patchMutation.mutate({
                          id: row.id,
                          patch: { is_active: true },
                        })
                      }
                      className="text-xs font-medium text-red-700 hover:underline shrink-0"
                    >
                      Restore
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
