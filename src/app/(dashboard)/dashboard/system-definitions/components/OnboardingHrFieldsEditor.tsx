"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { SystemOption } from "@/lib/systemDefinitions";
import {
  ONBOARDING_HR_FIELD_GROUPS,
  ONBOARDING_HR_FIELD_TYPES,
  parseOnboardingHrFieldRules,
  type OnboardingHrFieldDef,
} from "@/lib/careers/onboardingHrFormSchema";
import {
  ONBOARDING_HR_FIELDS_LIST,
  type OnboardingHrFieldGroup,
  type OnboardingHrFieldType,
} from "@/lib/systemDefinitions/onboardingHrDefaults";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

type OnboardingHrFieldsEditorProps = {
  moduleId: string;
  canAdd?: boolean;
  canEdit?: boolean;
};

type DraftRules = {
  fieldKey: string;
  fieldType: OnboardingHrFieldType;
  group: OnboardingHrFieldGroup;
  required: boolean;
  hint: string;
  colSpan: "half" | "full";
  options: string;
};

function rulesToDraft(rules: ReturnType<typeof parseOnboardingHrFieldRules>): DraftRules {
  return {
    fieldKey: rules.fieldKey,
    fieldType: rules.fieldType,
    group: rules.group,
    required: rules.required ?? false,
    hint: rules.hint ?? "",
    colSpan: rules.colSpan ?? "half",
    options: (rules.options ?? []).join(", "),
  };
}

function draftToRules(draft: DraftRules): Record<string, unknown> {
  const rules: Record<string, unknown> = {
    fieldKey: draft.fieldKey.trim(),
    fieldType: draft.fieldType,
    group: draft.group,
    required: draft.required,
    colSpan: draft.colSpan,
  };
  if (draft.hint.trim()) rules.hint = draft.hint.trim();
  if (draft.fieldType === "select" && draft.options.trim()) {
    rules.options = draft.options.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return rules;
}

function fieldFromOption(option: SystemOption): OnboardingHrFieldDef | null {
  const parsed = parseOnboardingHrFieldRules(option.rules as Record<string, unknown>);
  if (!parsed.fieldKey && !option.legacy_value) return null;
  return {
    id: option.id,
    label: option.label,
    sort_order: option.sort_order,
    is_active: option.is_active,
    fieldKey: parsed.fieldKey || option.legacy_value!.trim(),
    fieldType: parsed.fieldType,
    group: parsed.group,
    required: parsed.required,
    hint: parsed.hint,
    colSpan: parsed.colSpan,
    options: parsed.options,
  };
}

export default function OnboardingHrFieldsEditor({
  moduleId,
  canAdd = true,
  canEdit = true,
}: OnboardingHrFieldsEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_options", moduleId, ONBOARDING_HR_FIELDS_LIST];

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDraft, setNewDraft] = useState<DraftRules>({
    fieldKey: "",
    fieldType: "text",
    group: "hr",
    required: false,
    hint: "",
    colSpan: "half",
    options: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDraft, setEditDraft] = useState<DraftRules | null>(null);

  const { data: options = [], isLoading } = useQuery<SystemOption[]>({
    queryKey,
    queryFn: async () => {
      const res = await api.get("/system-definitions/options", {
        params: {
          module_id: moduleId,
          option_list: ONBOARDING_HR_FIELDS_LIST,
          include_inactive: true,
        },
      });
      return res.data.data as SystemOption[];
    },
    enabled: moduleId === RECRUITMENT_MODULE_ID,
  });

  const fields = options
    .map(fieldFromOption)
    .filter((f): f is OnboardingHrFieldDef => f !== null)
    .sort((a, b) => a.sort_order - b.sort_order);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (payload: {
      label: string;
      legacy_value: string;
      rules: Record<string, unknown>;
      sort_order: number;
    }) =>
      api.post("/system-definitions/options", {
        module_id: moduleId,
        option_list: ONBOARDING_HR_FIELDS_LIST,
        ...payload,
      }),
    onSuccess: () => {
      toast.success("HR field added.");
      setShowAdd(false);
      setNewLabel("");
      setNewDraft({
        fieldKey: "",
        fieldType: "text",
        group: "hr",
        required: false,
        hint: "",
        colSpan: "half",
        options: "",
      });
      invalidate();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not add HR field.");
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/system-definitions/options/${encodeURIComponent(id)}`, patch),
    onSuccess: () => {
      toast.success("HR field updated.");
      setEditingId(null);
      invalidate();
    },
    onError: () => toast.error("Could not save HR field."),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/system-definitions/options/${encodeURIComponent(id)}`, {
        is_active: false,
      }),
    onSuccess: () => {
      toast.success("HR field removed.");
      invalidate();
    },
    onError: () => toast.error("Could not remove HR field."),
  });

  const renderDraftForm = (
    draft: DraftRules,
    setDraft: (next: DraftRules) => void,
  ) => (
    <div className="grid sm:grid-cols-2 gap-2 mt-2">
      <label className="text-xs block">
        <span className="text-gray-500">Field key (hr_data)</span>
        <input
          className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-sm font-mono"
          value={draft.fieldKey}
          onChange={(e) => setDraft({ ...draft, fieldKey: e.target.value })}
        />
      </label>
      <label className="text-xs block">
        <span className="text-gray-500">Type</span>
        <select
          className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-sm"
          value={draft.fieldType}
          onChange={(e) =>
            setDraft({ ...draft, fieldType: e.target.value as OnboardingHrFieldType })
          }
        >
          {ONBOARDING_HR_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs block">
        <span className="text-gray-500">Section group</span>
        <select
          className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-sm"
          value={draft.group}
          onChange={(e) =>
            setDraft({ ...draft, group: e.target.value as OnboardingHrFieldGroup })
          }
        >
          {ONBOARDING_HR_FIELD_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs block">
        <span className="text-gray-500">Width</span>
        <select
          className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-sm"
          value={draft.colSpan}
          onChange={(e) =>
            setDraft({ ...draft, colSpan: e.target.value as "half" | "full" })
          }
        >
          <option value="half">Half column</option>
          <option value="full">Full width</option>
        </select>
      </label>
      {draft.fieldType === "select" && (
        <label className="text-xs block sm:col-span-2">
          <span className="text-gray-500">Options (comma-separated)</span>
          <input
            className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-sm"
            value={draft.options}
            onChange={(e) => setDraft({ ...draft, options: e.target.value })}
          />
        </label>
      )}
      <label className="text-xs block sm:col-span-2">
        <span className="text-gray-500">Hint (optional)</span>
        <input
          className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-sm"
          value={draft.hint}
          onChange={(e) => setDraft({ ...draft, hint: e.target.value })}
        />
      </label>
      <label className="text-xs flex items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={draft.required}
          onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
        />
        Required before completing onboarding
      </label>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading HR fields…
      </div>
    );
  }

  const activeFields = fields.filter((f) => f.is_active);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        These fields appear in HR Section O only — not on the candidate onboarding link. Use
        &quot;Employment placement&quot; for department, location, and similar dropdowns.
      </p>

      <div className="space-y-2">
        {activeFields.map((field) => {
          const groupLabel =
            ONBOARDING_HR_FIELD_GROUPS.find((g) => g.value === field.group)?.label ??
            field.group;
          const isEditing = editingId === field.id;

          return (
            <div
              key={field.id}
              className="border border-gray-200 rounded-lg p-3 bg-white"
            >
              {isEditing && editDraft ? (
                <>
                  <input
                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-medium mb-1"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                  {renderDraftForm(editDraft, setEditDraft)}
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() =>
                        patchMutation.mutate({
                          id: field.id,
                          patch: {
                            label: editLabel.trim(),
                            legacy_value: editDraft.fieldKey.trim(),
                            rules: draftToRules(editDraft),
                          },
                        })
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{field.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {groupLabel} · <span className="font-mono">{field.fieldKey}</span> ·{" "}
                      {field.fieldType}
                      {field.required ? " · required" : ""}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(field.id);
                          setEditLabel(field.label);
                          setEditDraft(rulesToDraft(field));
                        }}
                        className="p-1.5 rounded hover:bg-gray-100"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deactivateMutation.mutate(field.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canAdd && (
        <>
          {!showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:text-red-800"
            >
              <Plus className="w-4 h-4" />
              Add HR field
            </button>
          ) : (
            <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50/50">
              <label className="text-xs block mb-2">
                <span className="text-gray-500">Label</span>
                <input
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </label>
              {renderDraftForm(newDraft, setNewDraft)}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!newLabel.trim() || !newDraft.fieldKey.trim()) {
                      toast.error("Label and field key are required.");
                      return;
                    }
                    createMutation.mutate({
                      label: newLabel.trim(),
                      legacy_value: newDraft.fieldKey.trim(),
                      rules: draftToRules(newDraft),
                      sort_order: activeFields.length,
                    });
                  }}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                >
                  Add field
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-3 py-1.5 text-sm text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
