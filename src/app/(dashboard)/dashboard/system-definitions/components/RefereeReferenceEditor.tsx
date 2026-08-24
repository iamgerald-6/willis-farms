"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { ModuleBusinessLogic } from "@/lib/systemDefinitions";
import {
  defaultRefereeAssessmentAttributes,
  type RefereeAssessmentAttributeDef,
  type RefereeReferenceConfig,
} from "@/lib/systemDefinitions/refereeReferenceConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

async function fetchModuleConfigApi(moduleId: string) {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
  );
  return res.data.data as { businessLogic: ModuleBusinessLogic };
}

type RefereeReferenceEditorProps = {
  moduleId: string;
  readOnly?: boolean;
  canAdd?: boolean;
  canEdit?: boolean;
};

type AttributeDraft = RefereeAssessmentAttributeDef;

function slugifyKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export default function RefereeReferenceEditor({
  moduleId,
  readOnly = false,
  canAdd = true,
  canEdit = true,
}: RefereeReferenceEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];
  const [draft, setDraft] = useState<AttributeDraft[]>([]);

  const { data: businessLogic, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
    select: (data) => data.businessLogic,
    enabled: moduleId === RECRUITMENT_MODULE_ID,
  });

  useEffect(() => {
    const saved = businessLogic?.refereeReferenceConfig?.assessmentAttributes;
    if (saved?.length) {
      setDraft(saved.map((a) => ({ ...a })));
    } else {
      setDraft(defaultRefereeAssessmentAttributes());
    }
  }, [businessLogic]);

  const allowAdd = !readOnly && (canAdd || canEdit);
  const allowRemove = !readOnly && canEdit;

  const saveMutation = useMutation({
    mutationFn: async (payload: RefereeReferenceConfig) => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
      );
      const current = res.data.data.businessLogic as ModuleBusinessLogic;
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            refereeReferenceConfig: payload,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Referee form settings saved.");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save referee form.");
    },
  });

  const handleSave = () => {
    const cleaned: AttributeDraft[] = [];
    const usedKeys = new Set<string>();

    for (const row of draft) {
      const label = row.label.trim();
      if (!label) {
        toast.error("Each assessment line needs a label.");
        return;
      }
      let key = row.key.trim() || slugifyKey(label);
      if (!key) {
        toast.error("Each assessment line needs a key or label.");
        return;
      }
      while (usedKeys.has(key)) {
        key = `${key}_${cleaned.length + 1}`;
      }
      usedKeys.add(key);
      cleaned.push({ key, label });
    }

    if (cleaned.length === 0) {
      toast.error("Add at least one assessment line.");
      return;
    }

    saveMutation.mutate({ assessmentAttributes: cleaned });
  };

  if (moduleId !== RECRUITMENT_MODULE_ID) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        These rating lines appear on the public referee reference link sent after
        a job application. Add, edit, or remove lines — the same pattern as
        competency sections above.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {allowAdd && (
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => [
                  ...prev,
                  { key: `custom_${Date.now()}`, label: "" },
                ])
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Add assessment line
            </button>
          )}

          <div className="space-y-2">
            {draft.map((row, index) => (
              <div
                key={`${row.key}-${index}`}
                className="flex flex-col sm:flex-row gap-2 rounded-lg border border-gray-200 p-3 bg-white"
              >
                <label className="flex-1 block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Label shown to referee
                  </span>
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, label: e.target.value } : item,
                        ),
                      )
                    }
                    disabled={readOnly}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                  />
                </label>
                <label className="sm:w-48 block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Stored key
                  </span>
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, key: e.target.value } : item,
                        ),
                      )
                    }
                    disabled={readOnly}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono disabled:opacity-60"
                  />
                </label>
                {allowRemove && (
                  <button
                    type="button"
                    onClick={() => {
                      if (draft.length <= 1) {
                        toast.error("At least one assessment line is required.");
                        return;
                      }
                      setDraft((prev) => prev.filter((_, i) => i !== index));
                    }}
                    className="self-end sm:self-center p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                    title="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
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
              {saveMutation.isPending ? "Saving…" : "Save referee form"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
