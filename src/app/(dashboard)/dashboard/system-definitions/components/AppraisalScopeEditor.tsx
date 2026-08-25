"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { FormDefinition } from "@/lib/moduleRegistry/types";
import {
  DEFAULT_APPRAISAL_SCOPE,
  normalizeAppraisalScopeConfig,
  type AppraisalScopeConfig,
  type AppraisalScopeMode,
  type ModuleBusinessLogic,
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

type AppraisalScopeEditorProps = {
  moduleId: string;
  readOnly?: boolean;
};

export default function AppraisalScopeEditor({
  moduleId,
  readOnly = false,
}: AppraisalScopeEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];

  const { data: businessLogic, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
    select: (data) => data.businessLogic,
  });

  const currentMode =
    businessLogic?.appraisalScopeConfig?.mode ??
    DEFAULT_APPRAISAL_SCOPE.mode ??
    "grouped";

  const [draftMode, setDraftMode] = useState<AppraisalScopeMode | null>(null);
  const mode = draftMode ?? currentMode;

  const saveMutation = useMutation({
    mutationFn: async (scopeConfig: AppraisalScopeConfig) => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
      );
      const current = res.data.data.businessLogic as ModuleBusinessLogic;
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            appraisalScopeConfig: scopeConfig,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Appraisal scope saved.");
      setDraftMode(null);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({
        queryKey: ["system_module_config", moduleId, "appraisal_scope"],
      });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save scope.");
    },
  });

  const handleSave = () => {
    saveMutation.mutate(normalizeAppraisalScopeConfig({ mode }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Appraisal scope</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Choose whether staff share appraisal forms by grade group (e.g. L5–L8
          together) or get a separate form per grade level.
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
          <input
            type="radio"
            name="appraisal-scope"
            value="grouped"
            checked={mode === "grouped"}
            disabled={readOnly}
            onChange={() => setDraftMode("grouped")}
            className="mt-0.5"
          />
          <span>
            <span className="text-sm font-medium text-gray-900">
              Grouped by band
            </span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Four shared forms: L1, L2/L3, L4, and L5+ management. L5, L6, L7,
              and L8 use the same management form.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
          <input
            type="radio"
            name="appraisal-scope"
            value="individual"
            checked={mode === "individual"}
            disabled={readOnly}
            onChange={() => setDraftMode("individual")}
            className="mt-0.5"
          />
          <span>
            <span className="text-sm font-medium text-gray-900">
              Individual grade levels
            </span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Each grade (L1, L2, L3, … L8) has its own sections and questions.
              New grades start from the matching group template until you
              customise them.
            </span>
          </span>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={readOnly || saveMutation.isPending || mode === currentMode}
          onClick={handleSave}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
        >
          {saveMutation.isPending ? "Saving…" : "Save scope"}
        </button>
      </div>
    </div>
  );
}
