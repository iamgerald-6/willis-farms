"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { SectionDef } from "@/lib/appraisal/scoring";
import {
  SECTION_SET_UI_LABELS,
  getSectionsForBandSet,
  type SectionSet,
} from "@/lib/appraisal/sections";
import { useAppraisalScopeConfig } from "@/hooks/useAppraisalScopeConfig";
import type { FormDefinition } from "@/lib/moduleRegistry/types";
import type {
  ModuleBusinessLogic,
  SectionContentOverrides,
  SectionContentPatch,
} from "@/lib/systemDefinitions";

async function fetchModuleConfigApi(moduleId: string) {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
  );
  return res.data.data as {
    businessLogic: ModuleBusinessLogic;
    formDefinition: FormDefinition | null;
  };
}

type RatingSectionsEditorProps = {
  moduleId: string;
  readOnly?: boolean;
  canAdd?: boolean;
  canEdit?: boolean;
};

type SectionDraft = {
  key: string;
  title: string;
  items: string[];
};

function buildRatingDraft(
  gitSections: SectionDef[],
  patches?: Partial<Record<string, SectionContentPatch>>,
): SectionDraft[] {
  const draft: SectionDraft[] = [];

  for (const section of gitSections) {
    const patch = patches?.[section.key];
    if (patch?.hidden) continue;
    draft.push({
      key: section.key,
      title: patch?.title?.trim() || section.title,
      items: patch?.items?.length ? [...patch.items] : [...section.items],
    });
  }

  if (patches) {
    const gitKeys = new Set(gitSections.map((s) => s.key));
    for (const [key, patch] of Object.entries(patches)) {
      if (!patch || gitKeys.has(key) || patch.hidden) continue;
      if (!patch.title?.trim() && !patch.items?.length) continue;
      draft.push({
        key,
        title: patch.title?.trim() || "New section",
        items: patch.items?.length ? [...patch.items] : [""],
      });
    }
  }

  return draft;
}

function draftToPatches(
  draft: SectionDraft[],
  gitSections: SectionDef[],
): Record<string, SectionContentPatch> {
  const out: Record<string, SectionContentPatch> = {};
  const draftKeys = new Set(draft.map((s) => s.key));

  for (const s of draft) {
    out[s.key] = {
      title: s.title.trim(),
      items: s.items.map((item) => item.trim()).filter(Boolean),
    };
  }

  for (const section of gitSections) {
    if (!draftKeys.has(section.key)) {
      out[section.key] = { hidden: true };
    }
  }

  return out;
}

export default function RatingSectionsEditor({
  moduleId,
  readOnly = false,
  canAdd = true,
  canEdit = true,
}: RatingSectionsEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];
  const { formOptions, formKeyLabels } = useAppraisalScopeConfig();

  const [formKey, setFormKey] = useState("L1");
  const [sectionSet, setSectionSet] = useState<SectionSet>("quarterly");
  const [draft, setDraft] = useState<SectionDraft[]>([]);

  const activeFormKeys = useMemo(
    () => formOptions.map((o) => o.value),
    [formOptions],
  );

  useEffect(() => {
    if (activeFormKeys.length > 0 && !activeFormKeys.includes(formKey)) {
      setFormKey(activeFormKeys[0]);
    }
  }, [activeFormKeys, formKey]);

  const { data: businessLogic, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
    select: (data) => data.businessLogic,
  });

  const gitSections = useMemo(
    () => getSectionsForBandSet(formKey, sectionSet),
    [formKey, sectionSet],
  );

  useEffect(() => {
    const patches = businessLogic?.sectionContentOverrides?.[formKey]?.[sectionSet];
    setDraft(buildRatingDraft(gitSections, patches));
  }, [businessLogic, gitSections, formKey, sectionSet]);

  const allowAdd = !readOnly && (canAdd || canEdit);
  const allowRemove = !readOnly && canEdit;

  const saveMutation = useMutation({
    mutationFn: async (payload: SectionContentOverrides) => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
      );
      const current = res.data.data.businessLogic as ModuleBusinessLogic;
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            sectionContentOverrides: payload,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Rating sections saved.");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["appraisal_module_config"] });
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

  const updateItem = (sectionKey: string, itemIndex: number, value: string) => {
    setDraft((prev) =>
      prev.map((s) => {
        if (s.key !== sectionKey) return s;
        const items = [...s.items];
        items[itemIndex] = value;
        return { ...s, items };
      }),
    );
  };

  const handleSave = () => {
    if (!businessLogic) return;
    for (const s of draft) {
      if (!s.title.trim()) {
        toast.error(`Section ${s.key} needs a title.`);
        return;
      }
      if (s.items.some((item) => !item.trim())) {
        toast.error(`Section ${s.key} has a blank rating item.`);
        return;
      }
    }

    const next: SectionContentOverrides = {
      ...(businessLogic.sectionContentOverrides ?? {}),
      [formKey]: {
        ...(businessLogic.sectionContentOverrides?.[formKey] ?? {}),
        [sectionSet]: draftToPatches(draft, gitSections),
      },
    };

    saveMutation.mutate(next);
  };

  const addSection = () => {
    setDraft((prev) => [
      ...prev,
      {
        key: `custom-${Date.now()}`,
        title: "New section",
        items: [""],
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

  const addItem = (sectionKey: string) => {
    setDraft((prev) =>
      prev.map((s) =>
        s.key === sectionKey ? { ...s, items: [...s.items, ""] } : s,
      ),
    );
  };

  const removeItem = (sectionKey: string, itemIndex: number) => {
    setDraft((prev) =>
      prev.map((s) => {
        if (s.key !== sectionKey) return s;
        if (s.items.length <= 1) {
          toast.error("Each section needs at least one rating item.");
          return s;
        }
        return {
          ...s,
          items: s.items.filter((_, i) => i !== itemIndex),
        };
      }),
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Edit the rating section titles and the line items people score against.
        Choose a grade band and whether this is the Quarterly or Annual form.
        Weights are configured in the card below.
      </p>

      <div className="flex flex-wrap gap-2">
        {(["quarterly", "annual"] as SectionSet[]).map((set) => (
          <button
            key={set}
            type="button"
            onClick={() => setSectionSet(set)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              sectionSet === set
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {SECTION_SET_UI_LABELS[set]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {formOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFormKey(option.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              formKey === option.value
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {(formKeyLabels[option.value] ?? option.label).split("—")[0].trim()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading sections…
        </div>
      ) : draft.length === 0 ? (
        <p className="text-xs text-gray-400">No sections for this combination.</p>
      ) : (
        <>
          {allowAdd && (
            <button
              type="button"
              onClick={addSection}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Add section
            </button>
          )}

          <div className="space-y-4">
            {draft.map((section) => (
              <div
                key={section.key}
                className="rounded-lg border border-gray-200 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Section {section.key} — title
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
                      Rating items
                    </p>
                    {allowAdd && (
                      <button
                        type="button"
                        onClick={() => addItem(section.key)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add item
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {section.items.map((item, index) => (
                      <div key={`${section.key}-${index}`} className="flex gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) =>
                            updateItem(section.key, index, e.target.value)
                          }
                          disabled={readOnly}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                        />
                        {allowRemove && (
                          <button
                            type="button"
                            onClick={() => removeItem(section.key, index)}
                            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                            title="Remove item"
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

          <div className="flex justify-end">
            <button
              type="button"
              disabled={readOnly || saveMutation.isPending}
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving…" : "Save sections"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
