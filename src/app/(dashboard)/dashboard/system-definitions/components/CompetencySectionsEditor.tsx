"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { ModuleBusinessLogic } from "@/lib/systemDefinitions";
import {
  SKILL_LOG_TYPES_LIST,
  type CompetencyContentOverrides,
  type CompetencySectionPatch,
  sectionKeyForIndex,
} from "@/lib/systemDefinitions";
import type { SystemOption } from "@/lib/systemDefinitions/types";
import { SKILL_LOG_TYPES } from "@/lib/moduleRegistry/taxonomy/skillLogLogTypes";
import type { SkillLogSectionDef } from "@/lib/moduleRegistry/taxonomy/skillLogLogTypes";

async function fetchModuleConfigApi(moduleId: string) {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
  );
  return res.data.data as {
    businessLogic: ModuleBusinessLogic;
  };
}

type CompetencySectionsEditorProps = {
  moduleId: string;
  readOnly?: boolean;
  canAdd?: boolean;
  canEdit?: boolean;
};

type SectionDraft = {
  key: string;
  title: string;
  skills: string[];
};

function buildCompetencyDraft(
  gitSections: SkillLogSectionDef[],
  patches?: Partial<Record<string, CompetencySectionPatch>>,
): SectionDraft[] {
  const draft: SectionDraft[] = [];

  gitSections.forEach((section, index) => {
    const key = sectionKeyForIndex(index);
    const patch = patches?.[key];
    if (patch?.hidden) return;
    draft.push({
      key,
      title: patch?.title?.trim() || section.title,
      skills: patch?.skills?.length ? [...patch.skills] : [...section.skills],
    });
  });

  if (patches) {
    const gitKeys = new Set(gitSections.map((_, i) => sectionKeyForIndex(i)));
    for (const [key, patch] of Object.entries(patches)) {
      if (!patch || gitKeys.has(key) || patch.hidden) continue;
      if (!patch.title?.trim() && !patch.skills?.length) continue;
      draft.push({
        key,
        title: patch.title?.trim() || "New section",
        skills: patch.skills?.length ? [...patch.skills] : [""],
      });
    }
  }

  return draft;
}

function draftToPatches(
  draft: SectionDraft[],
  gitSectionCount: number,
): Record<string, CompetencySectionPatch> {
  const out: Record<string, CompetencySectionPatch> = {};
  const draftKeys = new Set(draft.map((s) => s.key));

  for (const s of draft) {
    out[s.key] = {
      title: s.title.trim(),
      skills: s.skills.map((skill) => skill.trim()).filter(Boolean),
    };
  }

  for (let i = 0; i < gitSectionCount; i++) {
    const key = sectionKeyForIndex(i);
    if (!draftKeys.has(key)) {
      out[key] = { hidden: true };
    }
  }

  return out;
}

export default function CompetencySectionsEditor({
  moduleId,
  readOnly = false,
  canAdd = true,
  canEdit = true,
}: CompetencySectionsEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];

  const { data: logTypeOptions = [] } = useQuery<SystemOption[]>({
    queryKey: ["system_options", moduleId, SKILL_LOG_TYPES_LIST],
    queryFn: async () => {
      const res = await api.get("/system-definitions/options", {
        params: {
          module_id: moduleId,
          option_list: SKILL_LOG_TYPES_LIST,
        },
      });
      return res.data.data as SystemOption[];
    },
  });

  const [logType, setLogType] = useState("");
  const [draft, setDraft] = useState<SectionDraft[]>([]);

  useEffect(() => {
    if (!logType && logTypeOptions.length > 0) {
      setLogType(logTypeOptions[0].legacy_value ?? logTypeOptions[0].label);
    }
  }, [logTypeOptions, logType]);

  const { data: businessLogic, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
    select: (data) => data.businessLogic,
  });

  const gitSections = useMemo(() => {
    if (!logType) return [];
    return SKILL_LOG_TYPES[logType] ?? [];
  }, [logType]);

  const logTypeLabel = useMemo(() => {
    const match = logTypeOptions.find(
      (opt) => (opt.legacy_value ?? opt.label) === logType,
    );
    return match?.label ?? logType;
  }, [logTypeOptions, logType]);

  const hasGitTemplate = gitSections.length > 0;

  useEffect(() => {
    const patches = businessLogic?.competencyContentOverrides?.[logType];
    setDraft(buildCompetencyDraft(gitSections, patches));
  }, [businessLogic, gitSections, logType]);

  const allowAdd = !readOnly && (canAdd || canEdit);
  const allowRemove = !readOnly && canEdit;

  const saveMutation = useMutation({
    mutationFn: async (payload: CompetencyContentOverrides) => {
      const fresh = await fetchModuleConfigApi(moduleId);
      const current = fresh.businessLogic;
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            competencyContentOverrides: payload,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Competency sections saved.");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["skill_log_module_config"] });
      queryClient.invalidateQueries({
        queryKey: ["system_options", moduleId, SKILL_LOG_TYPES_LIST],
      });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save sections.");
    },
  });

  const updateSectionTitle = (key: string, title: string) => {
    setDraft((prev) =>
      prev.map((s) => (s.key === key ? { ...s, title } : s)),
    );
  };

  const updateSkill = (sectionKey: string, skillIndex: number, value: string) => {
    setDraft((prev) =>
      prev.map((s) => {
        if (s.key !== sectionKey) return s;
        const skills = [...s.skills];
        skills[skillIndex] = value;
        return { ...s, skills };
      }),
    );
  };

  const handleSave = () => {
    if (!businessLogic || !logType) return;
    if (draft.length === 0) {
      toast.error(
        "Add at least one section before saving — saving an empty form would remove sections for this type.",
      );
      return;
    }
    for (const s of draft) {
      if (!s.title.trim()) {
        toast.error(`Section ${s.key} needs a title.`);
        return;
      }
      if (s.skills.some((skill) => !skill.trim())) {
        toast.error(`Section ${s.key} has a blank competency line.`);
        return;
      }
    }

    const next: CompetencyContentOverrides = {
      ...(businessLogic.competencyContentOverrides ?? {}),
      [logType]: draftToPatches(draft, gitSections.length),
    };

    saveMutation.mutate(next);
  };

  const addSection = () => {
    setDraft((prev) => [
      ...prev,
      {
        key: `sec-custom-${Date.now()}`,
        title: "New section",
        skills: [""],
      },
    ]);
  };

  const removeSection = (key: string) => {
    if (draft.length <= 1) {
      toast.error("At least one section is required.");
      return;
    }
    setDraft((prev) => prev.filter((s) => s.key !== key));
  };

  const addSkillLine = (sectionKey: string) => {
    setDraft((prev) =>
      prev.map((s) =>
        s.key === sectionKey ? { ...s, skills: [...s.skills, ""] } : s,
      ),
    );
  };

  const removeSkillLine = (sectionKey: string, skillIndex: number) => {
    setDraft((prev) =>
      prev.map((s) => {
        if (s.key !== sectionKey) return s;
        if (s.skills.length <= 1) {
          toast.error("Each section needs at least one competency line.");
          return s;
        }
        return {
          ...s,
          skills: s.skills.filter((_, i) => i !== skillIndex),
        };
      }),
    );
  };

  if (logTypeOptions.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        Add at least one Skills Log Type in the dropdown options above before
        editing competency sections.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Sections and competency lines are saved per skills log type. Choose the
        type first, then add or edit sections for that type only. After adding a
        new type above, select it here before adding sections.
      </p>

      <div className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2.5">
        <p className="text-xs font-semibold text-gray-800">
          Editing sections for: {logTypeLabel || "—"}
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {hasGitTemplate
            ? "Built-in template loaded — you can add sections, remove sections, or edit lines."
            : "No built-in template for this type — add sections here and they apply only to this skills log type."}
        </p>
      </div>

      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Skills log type
        </label>
        <select
          value={logType}
          onChange={(e) => setLogType(e.target.value)}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {logTypeOptions.map((opt) => {
            const value = opt.legacy_value ?? opt.label;
            return (
              <option key={opt.id} value={value}>
                {opt.label}
              </option>
            );
          })}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading sections…
        </div>
      ) : (
        <>
          {allowAdd && (
            <button
              type="button"
              onClick={addSection}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Add section for {logTypeLabel || "this type"}
            </button>
          )}

          {draft.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-2">
              No sections yet for this skills log type. Use the button above to
              add the first section.
            </p>
          ) : (
            <div className="space-y-4">
            {draft.map((section) => (
              <div
                key={section.key}
                className="rounded-lg border border-gray-200 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Section title
                    </label>
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) =>
                        updateSectionTitle(section.key, e.target.value)
                      }
                      disabled={readOnly}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                    />
                  </div>
                  {allowRemove && (
                    <button
                      type="button"
                      onClick={() => removeSection(section.key)}
                      className="mt-5 p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove section"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Competency lines
                    </p>
                    {allowAdd && (
                      <button
                        type="button"
                        onClick={() => addSkillLine(section.key)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add line
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {section.skills.map((skill, index) => (
                      <div key={`${section.key}-${index}`} className="flex gap-2">
                        <input
                          type="text"
                          value={skill}
                          onChange={(e) =>
                            updateSkill(section.key, index, e.target.value)
                          }
                          disabled={readOnly}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                        />
                        {allowRemove && (
                          <button
                            type="button"
                            onClick={() => removeSkillLine(section.key, index)}
                            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                            title="Remove line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={readOnly || saveMutation.isPending}
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving…" : "Save competency sections"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
