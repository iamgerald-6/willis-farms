"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  SECTION_SET_UI_LABELS,
  getSectionMetaForBandSet,
  type SectionSet,
} from "@/lib/appraisal/sections";
import { useAppraisalScopeConfig } from "@/hooks/useAppraisalScopeConfig";
import type { FormDefinition } from "@/lib/moduleRegistry/types";
import type { ModuleBusinessLogic } from "@/lib/systemDefinitions";

async function fetchModuleConfigApi(moduleId: string) {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
  );
  return res.data.data as {
    businessLogic: ModuleBusinessLogic;
    formDefinition: FormDefinition | null;
  };
}

type SectionWeightsEditorProps = {
  moduleId: string;
  readOnly?: boolean;
};

type Scope = "global" | string;

function weightSum(weights: Record<string, number>): number {
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

export default function SectionWeightsEditor({
  moduleId,
  readOnly = false,
}: SectionWeightsEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];
  const { formOptions, formKeyLabels } = useAppraisalScopeConfig();

  const [sectionSet, setSectionSet] = useState<SectionSet>("quarterly");
  const [scope, setScope] = useState<Scope>("global");
  const [draft, setDraft] = useState<Record<string, number>>({});

  const { data: businessLogic, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
    select: (data) => data.businessLogic,
  });

  const sectionMeta = useMemo(() => {
    if (scope === "global") {
      return getSectionMetaForBandSet("L1", sectionSet);
    }
    return getSectionMetaForBandSet(scope, sectionSet);
  }, [scope, sectionSet]);

  useEffect(() => {
    if (!businessLogic || sectionMeta.length === 0) return;

    const next: Record<string, number> = {};
    for (const s of sectionMeta) {
      if (scope === "global") {
        next[s.key] =
          businessLogic.globalSectionWeights?.[sectionSet]?.[s.key] ??
          s.defaultWeight;
      } else {
        next[s.key] =
          businessLogic.sectionBaseWeights?.[scope]?.[sectionSet]?.[s.key] ??
          businessLogic.globalSectionWeights?.[sectionSet]?.[s.key] ??
          s.defaultWeight;
      }
    }
    setDraft(next);
  }, [businessLogic, sectionMeta, scope, sectionSet]);

  const saveMutation = useMutation({
    mutationFn: async (payload: ModuleBusinessLogic) => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
      );
      const current = res.data.data.businessLogic as ModuleBusinessLogic;
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            ...payload,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Section weights saved.");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save weights.");
    },
  });

  const handleWeightChange = (key: string, pct: number) => {
    setDraft((prev) => ({ ...prev, [key]: pct / 100 }));
  };

  const handleSave = () => {
    const sum = weightSum(draft);
    if (Math.abs(sum - 1) > 0.02) {
      toast.error(
        `Weights must add up to 100% (currently ${(sum * 100).toFixed(0)}%).`,
      );
      return;
    }

    if (!businessLogic) return;

    if (scope === "global") {
      const globalSectionWeights = {
        ...(businessLogic.globalSectionWeights ?? {}),
        [sectionSet]: { ...draft },
      };
      saveMutation.mutate({
        ...businessLogic,
        globalSectionWeights,
      });
      return;
    }

    const sectionBaseWeights = {
      ...(businessLogic.sectionBaseWeights ?? {}),
      [scope]: {
        ...(businessLogic.sectionBaseWeights?.[scope] ?? {}),
        [sectionSet]: { ...draft },
      },
    };
    saveMutation.mutate({
      ...businessLogic,
      sectionBaseWeights,
    });
  };

  const totalPct = weightSum(draft) * 100;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">
          Rating section weights
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Set how much each section counts in the score. Use{" "}
          <strong>All grade bands</strong> to apply the same split to everyone
          (e.g. Section A = 15% for all L1–L7). Use a specific band to override
          only that group.
        </p>
      </div>

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
        <button
          type="button"
          onClick={() => setScope("global")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
            scope === "global"
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-600 border-gray-200"
          }`}
        >
          All grade bands
        </button>
        {formOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setScope(option.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              scope === option.value
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
          <Loader2 className="w-4 h-4 animate-spin" /> Loading weights…
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                  <th className="px-3 py-2 font-medium">Section</th>
                  <th className="px-3 py-2 font-medium w-28">Weight %</th>
                </tr>
              </thead>
              <tbody>
                {sectionMeta.map((s) => (
                  <tr key={s.key} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium text-gray-800">
                        {s.key}. {s.title}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        step={1}
                        value={Math.round((draft[s.key] ?? s.defaultWeight) * 100)}
                        onChange={(e) =>
                          handleWeightChange(s.key, Number(e.target.value))
                        }
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p
              className={`text-xs font-medium ${
                Math.abs(totalPct - 100) <= 2
                  ? "text-green-600"
                  : "text-amber-600"
              }`}
            >
              Total: {totalPct.toFixed(0)}%
              {Math.abs(totalPct - 100) > 2 && " — should be 100%"}
            </p>
            <button
              type="button"
              disabled={readOnly || saveMutation.isPending}
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving…" : "Save weights"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
