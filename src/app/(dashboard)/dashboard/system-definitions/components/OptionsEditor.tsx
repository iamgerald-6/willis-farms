"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { SystemOption, SystemOptionRules } from "@/lib/systemDefinitions";

type OptionsEditorProps = {
  moduleId: string;
  optionList: string;
  title?: string;
  description?: string;
  canAdd?: boolean;
  canEdit?: boolean;
};

function rulesSummary(rules: SystemOptionRules): string {
  const parts: string[] = [];
  if (rules.requires_document) parts.push("Needs a document");
  if (rules.requires_reason) parts.push("Needs a reason");
  return parts.length ? parts.join(" · ") : "No extra rules";
}

export default function OptionsEditor({
  moduleId,
  optionList,
  title = "Dropdown options",
  description = "Choices people can pick from. Changes apply to forms immediately.",
  canAdd = true,
  canEdit = true,
}: OptionsEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_options", moduleId, optionList];

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newLegacy, setNewLegacy] = useState("");
  const [newRules, setNewRules] = useState<SystemOptionRules>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editLegacy, setEditLegacy] = useState("");
  const [editRules, setEditRules] = useState<SystemOptionRules>({});

  const { data: options = [], isLoading } = useQuery<SystemOption[]>({
    queryKey,
    queryFn: async () => {
      const res = await api.get("/system-definitions/options", {
        params: {
          module_id: moduleId,
          option_list: optionList,
          include_inactive: true,
        },
      });
      return res.data.data as SystemOption[];
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (payload: {
      module_id: string;
      option_list: string;
      label: string;
      legacy_value: string;
      rules: SystemOptionRules;
    }) => api.post("/system-definitions/options", payload),
    onSuccess: () => {
      toast.success("Option added.");
      setShowAdd(false);
      setNewLabel("");
      setNewLegacy("");
      setNewRules({});
      invalidate();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not add option.");
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Record<string, unknown>;
    }) =>
      api.patch(
        `/system-definitions/options/${encodeURIComponent(id)}`,
        patch,
      ),
    onSuccess: () => {
      toast.success("Saved.");
      setEditingId(null);
      invalidate();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save.");
    },
  });

  const startEdit = (opt: SystemOption) => {
    setEditingId(opt.id);
    setEditLabel(opt.label);
    setEditLegacy(opt.legacy_value ?? opt.label);
    setEditRules({ ...opt.rules });
  };

  const handleAdd = () => {
    const label = newLabel.trim();
    const legacy = (newLegacy.trim() || label).trim();
    if (!label) {
      toast.error("Label is required.");
      return;
    }
    createMutation.mutate({
      module_id: moduleId,
      option_list: optionList,
      label,
      legacy_value: legacy,
      rules: newRules,
    });
  };

  const activeOptions = options.filter((o) => o.is_active);
  const inactiveOptions = options.filter((o) => !o.is_active);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Add option
          </button>
        )}
      </div>

      {showAdd && (
        <div className="rounded-lg border border-red-100 bg-red-50/40 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Label shown to people
              </label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="e.g. Study leave"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Stored value{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                value={newLegacy}
                onChange={(e) => setNewLegacy(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="Same as label if left blank"
              />
            </div>
          </div>
          <RuleToggles rules={newRules} onChange={setNewRules} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={handleAdd}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {createMutation.isPending ? "Saving…" : "Save option"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading options…
        </div>
      ) : activeOptions.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-2 text-center">
          No options yet. Add one above or run the database setup script.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
          {activeOptions.map((opt) => (
            <li key={opt.id} className="bg-white px-3 py-2.5">
              {editingId === opt.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={editLegacy}
                      onChange={(e) => setEditLegacy(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      placeholder="Stored value"
                    />
                  </div>
                  <RuleToggles rules={editRules} onChange={setEditRules} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={patchMutation.isPending}
                      onClick={() =>
                        patchMutation.mutate({
                          id: opt.id,
                          patch: {
                            label: editLabel.trim(),
                            legacy_value: editLegacy.trim(),
                            rules: editRules,
                          },
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-green-600 text-white"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-gray-200 text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Stored as: {opt.legacy_value ?? opt.label} ·{" "}
                      {rulesSummary(opt.rules)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(opt)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={patchMutation.isPending}
                          onClick={() =>
                            patchMutation.mutate({
                              id: opt.id,
                              patch: { is_active: false },
                            })
                          }
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Remove (hide from forms)"
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

      {inactiveOptions.length > 0 && (
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">
            {inactiveOptions.length} hidden option
            {inactiveOptions.length !== 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-1 pl-2">
            {inactiveOptions.map((opt) => (
              <li key={opt.id} className="flex items-center justify-between gap-2">
                <span className="line-through">{opt.label}</span>
                <button
                  type="button"
                  disabled={patchMutation.isPending || !canEdit}
                  onClick={() =>
                    patchMutation.mutate({
                      id: opt.id,
                      patch: { is_active: true },
                    })
                  }
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RuleToggles({
  rules,
  onChange,
}: {
  rules: SystemOptionRules;
  onChange: (r: SystemOptionRules) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4 text-xs">
      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!rules.requires_document}
          onChange={(e) =>
            onChange({ ...rules, requires_document: e.target.checked })
          }
          className="rounded border-gray-300 text-red-600 focus:ring-red-400"
        />
        <span className="text-gray-700">Must attach a document</span>
      </label>
      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!rules.requires_reason}
          onChange={(e) =>
            onChange({ ...rules, requires_reason: e.target.checked })
          }
          className="rounded border-gray-300 text-red-600 focus:ring-red-400"
        />
        <span className="text-gray-700">Must give a reason</span>
      </label>
    </div>
  );
}
