"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { FormDefinition } from "@/lib/moduleRegistry/types";
import type { ModuleBusinessLogic, SectionWeightRule } from "@/lib/systemDefinitions";

async function fetchModuleConfigApi(moduleId: string) {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
  );
  return res.data.data as {
    businessLogic: ModuleBusinessLogic;
    formDefinition: FormDefinition | null;
  };
}

const GRADE_OPTIONS = [
  { value: 0, label: "L1 and above" },
  { value: 1, label: "L2 and above" },
  { value: 2, label: "L3 and above" },
  { value: 3, label: "L4 and above" },
  { value: 4, label: "L5 and above" },
];

const SECTION_KEYS = ["A", "B", "C", "D", "E", "F"];

type BusinessLogicEditorProps = {
  moduleId: string;
  canAdd?: boolean;
  canEdit?: boolean;
};

export default function BusinessLogicEditor({
  moduleId,
  canAdd = true,
  canEdit = true,
}: BusinessLogicEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newMinGrade, setNewMinGrade] = useState(3);
  const [newSectionKey, setNewSectionKey] = useState("A");
  const [newWeight, setNewWeight] = useState(0.25);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SectionWeightRule | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
    select: (data) => data.businessLogic.sectionWeightRules ?? [],
  });

  const saveMutation = useMutation({
    mutationFn: async (nextRules: SectionWeightRule[]) => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
      );
      const current = res.data.data.businessLogic as ModuleBusinessLogic;
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            sectionWeightRules: nextRules,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Rules saved.");
      setShowAdd(false);
      setEditingId(null);
      setEditDraft(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save rules.");
    },
  });

  const persist = (next: SectionWeightRule[]) => saveMutation.mutate(next);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) {
      toast.error("Label is required.");
      return;
    }
    const id = `rule:${Date.now()}`;
    persist([
      ...rules,
      {
        id,
        label,
        minGradeIndex: newMinGrade,
        sectionKey: newSectionKey,
        weight: newWeight,
        enabled: true,
      },
    ]);
    setNewLabel("");
    setNewMinGrade(3);
    setNewSectionKey("A");
    setNewWeight(0.25);
  };

  const startEdit = (rule: SectionWeightRule) => {
    setEditingId(rule.id);
    setEditDraft({ ...rule });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
        <p className="text-sm font-semibold text-gray-900">
          Extra rules by employee grade
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Conditional overrides on top of the base section weights — e.g. L4+
          gets a higher Leadership (Section A) weight. Use{" "}
          <strong>Rating section weights</strong> above to change defaults for
          everyone.
        </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add rule
          </button>
        )}
      </div>

      {showAdd && (
        <div className="rounded-lg border border-red-100 bg-red-50/40 p-3 space-y-3">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Rule label, e.g. L4+ higher Leadership weight"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={newMinGrade}
              onChange={(e) => setNewMinGrade(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {GRADE_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
            <select
              value={newSectionKey}
              onChange={(e) => setNewSectionKey(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {SECTION_KEYS.map((k) => (
                <option key={k} value={k}>
                  Section {k}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0.05}
              max={0.9}
              step={0.01}
              value={newWeight}
              onChange={(e) => setNewWeight(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              placeholder="Weight"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={handleAdd}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white"
            >
              Save rule
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading rules…
        </div>
      ) : rules.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-2 text-center">
          No weight rules yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
          {rules.map((rule) => (
            <li key={rule.id} className="bg-white px-3 py-2.5">
              {editingId === rule.id && editDraft ? (
                <div className="space-y-3">
                  <input
                    value={editDraft.label}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, label: e.target.value })
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select
                      value={editDraft.minGradeIndex}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          minGradeIndex: Number(e.target.value),
                        })
                      }
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editDraft.sectionKey}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          sectionKey: e.target.value,
                        })
                      }
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      {SECTION_KEYS.map((k) => (
                        <option key={k} value={k}>
                          Section {k}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0.05}
                      max={0.9}
                      step={0.01}
                      value={editDraft.weight}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          weight: Number(e.target.value),
                        })
                      }
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={editDraft.enabled}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          enabled: e.target.checked,
                        })
                      }
                    />
                    Rule is active
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saveMutation.isPending}
                      onClick={() =>
                        persist(
                          rules.map((r) =>
                            r.id === rule.id ? editDraft : r,
                          ),
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-green-600 text-white"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft(null);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-gray-200"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {rule.label}
                      {!rule.enabled && (
                        <span className="ml-2 text-xs text-gray-400">
                          (paused)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {GRADE_OPTIONS.find((g) => g.value === rule.minGradeIndex)
                        ?.label ?? `Grade index ${rule.minGradeIndex}`}{" "}
                      · Section {rule.sectionKey} · weight{" "}
                      {(rule.weight * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(rule)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={saveMutation.isPending}
                          onClick={() =>
                            persist(
                              rules.map((r) =>
                                r.id === rule.id
                                  ? { ...r, enabled: !r.enabled }
                                  : r,
                              ),
                            )
                          }
                          className="px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-600"
                        >
                          {rule.enabled ? "Pause" : "Enable"}
                        </button>
                        <button
                          type="button"
                          disabled={saveMutation.isPending}
                          onClick={() =>
                            persist(rules.filter((r) => r.id !== rule.id))
                          }
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
