"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { SectionDef } from "@/lib/appraisal/scoring";
import {
  APPRAISAL_GRADE_BANDS,
  APPRAISAL_GRADE_BAND_LABELS,
  SECTION_SET_UI_LABELS,
  getSectionsForBandSet,
  type AppraisalGradeBand,
  type SectionSet,
} from "@/lib/appraisal/sections";
import type { FormDefinition } from "@/lib/moduleRegistry/types";
import type {
  ModuleBusinessLogic,
  SectionContentOverrides,
  SectionContentPatch,
} from "@/lib/systemDefinitions";
import { mergeSectionContentPatches } from "@/lib/systemDefinitions/sectionContentOverrides";

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
};

type SectionDraft = {
  key: string;
  title: string;
  items: string[];
};

function sectionsToDraft(sections: SectionDef[]): SectionDraft[] {
  return sections.map((s) => ({
    key: s.key,
    title: s.title,
    items: [...s.items],
  }));
}

function draftToPatches(draft: SectionDraft[]): Record<string, SectionContentPatch> {
  const out: Record<string, SectionContentPatch> = {};
  for (const s of draft) {
    out[s.key] = {
      title: s.title.trim(),
      items: s.items.map((item) => item.trim()).filter(Boolean),
    };
  }
  return out;
}

export default function RatingSectionsEditor({
  moduleId,
  readOnly = false,
}: RatingSectionsEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];

  const [gradeBand, setGradeBand] = useState<AppraisalGradeBand>("L1");
  const [sectionSet, setSectionSet] = useState<SectionSet>("quarterly");
  const [draft, setDraft] = useState<SectionDraft[]>([]);

  const { data: businessLogic, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
    select: (data) => data.businessLogic,
  });

  const gitSections = useMemo(
    () => getSectionsForBandSet(gradeBand, sectionSet),
    [gradeBand, sectionSet],
  );

  useEffect(() => {
    const patches = businessLogic?.sectionContentOverrides?.[gradeBand]?.[sectionSet];
    const merged = mergeSectionContentPatches(gitSections, patches);
    setDraft(sectionsToDraft(merged));
  }, [businessLogic, gitSections, gradeBand, sectionSet]);

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
      [gradeBand]: {
        ...(businessLogic.sectionContentOverrides?.[gradeBand] ?? {}),
        [sectionSet]: draftToPatches(draft),
      },
    };

    saveMutation.mutate(next);
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
        {APPRAISAL_GRADE_BANDS.map((band) => (
          <button
            key={band}
            type="button"
            onClick={() => setGradeBand(band)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              gradeBand === band
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {APPRAISAL_GRADE_BAND_LABELS[band].split("—")[0].trim()}
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
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                    Rating items
                  </p>
                  <div className="space-y-2">
                    {section.items.map((item, index) => (
                      <input
                        key={`${section.key}-${index}`}
                        type="text"
                        value={item}
                        onChange={(e) =>
                          updateItem(section.key, index, e.target.value)
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
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
              {saveMutation.isPending ? "Saving…" : "Save sections"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
