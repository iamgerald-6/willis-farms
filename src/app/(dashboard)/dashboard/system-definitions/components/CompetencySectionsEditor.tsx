"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { ModuleBusinessLogic } from "@/lib/systemDefinitions";
import {
  SKILL_LOG_TYPES_LIST,
  type CompetencyContentOverrides,
  type CompetencySectionPatch,
  mergeCompetencyContentPatches,
  resolveSkillLogSectionsForType,
  sectionKeyForIndex,
} from "@/lib/systemDefinitions";
import type { SystemOption } from "@/lib/systemDefinitions/types";
import { SKILL_LOG_TYPES } from "@/lib/moduleRegistry/taxonomy/skillLogLogTypes";

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
};

type SectionDraft = {
  key: string;
  title: string;
  skills: string[];
};

function sectionsToDraft(
  sections: ReturnType<typeof resolveSkillLogSectionsForType>,
): SectionDraft[] {
  return sections.map((s, index) => ({
    key: sectionKeyForIndex(index),
    title: s.title,
    skills: [...s.skills],
  }));
}

function draftToPatches(draft: SectionDraft[]): Record<string, CompetencySectionPatch> {
  const out: Record<string, CompetencySectionPatch> = {};
  for (const s of draft) {
    out[s.key] = {
      title: s.title.trim(),
      skills: s.skills.map((skill) => skill.trim()).filter(Boolean),
    };
  }
  return out;
}

export default function CompetencySectionsEditor({
  moduleId,
  readOnly = false,
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

  useEffect(() => {
    const patches = businessLogic?.competencyContentOverrides?.[logType];
    const merged = mergeCompetencyContentPatches(gitSections, patches);
    setDraft(sectionsToDraft(merged));
  }, [businessLogic, gitSections, logType]);

  const saveMutation = useMutation({
    mutationFn: async (payload: CompetencyContentOverrides) => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
      );
      const current = res.data.data.businessLogic as ModuleBusinessLogic;
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
      [logType]: draftToPatches(draft),
    };

    saveMutation.mutate(next);
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
        Edit competency section titles and skill lines for each log type. Changes
        apply to new and in-progress skill logs immediately.
      </p>

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
      ) : draft.length === 0 ? (
        <p className="text-xs text-gray-400">
          No competency sections defined for this log type in Git defaults.
          Add the type key to match an existing template, or contact support.
        </p>
      ) : (
        <>
          <div className="space-y-4">
            {draft.map((section) => (
              <div
                key={section.key}
                className="rounded-lg border border-gray-200 p-4 space-y-3"
              >
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Section {section.key}
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
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                    Competency lines
                  </p>
                  <div className="space-y-2">
                    {section.skills.map((skill, index) => (
                      <input
                        key={`${section.key}-${index}`}
                        type="text"
                        value={skill}
                        onChange={(e) =>
                          updateSkill(section.key, index, e.target.value)
                        }
                        disabled={readOnly}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

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
